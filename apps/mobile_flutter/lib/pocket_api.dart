import 'dart:async';
import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:mime/mime.dart';

import 'pocket_models.dart';

class PocketApiException implements Exception {
  PocketApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

class PocketBridgeApi {
  PocketBridgeApi(this.pairing, {http.Client? client})
    : _client = client ?? http.Client();

  final PairingInfo pairing;
  final http.Client _client;

  static Future<PairingInfo> fetchPairingFromServer(String serverInput) async {
    final uri = _pairingUri(serverInput);
    final response = await http.get(uri);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw PocketApiException(
        _errorMessage(response),
        statusCode: response.statusCode,
      );
    }

    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('Pairing response must be a JSON object');
    }
    return PairingInfo.fromJson(decoded);
  }

  Future<void> checkHealth() async {
    final response = await _client.get(_uri('/health'));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw PocketApiException(
        _errorMessage(response),
        statusCode: response.statusCode,
      );
    }
  }

  Future<PocketItem> uploadText({
    required String title,
    required String text,
    required String sourceDevice,
  }) async {
    final response = await _client.post(
      _uri('/api/items/text'),
      headers: {..._authHeaders, 'Content-Type': 'application/json'},
      body: jsonEncode({
        'title': title,
        'text': text,
        'origin': 'mobile',
        'sourceDevice': sourceDevice,
        'tags': ['mobile'],
      }),
    );
    return _itemFromResponse(response);
  }

  Future<PocketItem> uploadFile({
    required PlatformFile file,
    required String sourceDevice,
    void Function(int sentBytes, int totalBytes)? onProgress,
  }) async {
    final request = http.MultipartRequest('POST', _uri('/api/items/upload'))
      ..headers.addAll(_authHeaders)
      ..fields['origin'] = 'mobile'
      ..fields['sourceDevice'] = sourceDevice
      ..fields['tags'] = jsonEncode(['mobile']);

    final contentType = _mediaTypeFor(file);
    if (file.readStream != null) {
      request.files.add(
        http.MultipartFile(
          'file',
          _trackProgress(file.readStream!, file.size, onProgress),
          file.size,
          filename: file.name,
          contentType: contentType,
        ),
      );
    } else if (file.path != null) {
      request.files.add(
        await http.MultipartFile.fromPath(
          'file',
          file.path!,
          filename: file.name,
          contentType: contentType,
        ),
      );
    } else if (file.bytes != null) {
      request.files.add(
        http.MultipartFile(
          'file',
          _trackProgress(Stream.value(file.bytes!), file.size, onProgress),
          file.size,
          filename: file.name,
          contentType: contentType,
        ),
      );
    } else {
      throw PocketApiException(
        'Selected file has no readable stream, path, or bytes',
      );
    }

    onProgress?.call(0, file.size);
    final streamed = await _client.send(request);
    final body = await streamed.stream.bytesToString();
    if (streamed.statusCode < 200 || streamed.statusCode >= 300) {
      throw PocketApiException(
        _errorMessageFromBody(body, streamed.reasonPhrase),
        statusCode: streamed.statusCode,
      );
    }

    onProgress?.call(file.size, file.size);
    return _itemFromBody(body);
  }

  Future<List<PocketItem>> listSharedItems() async {
    return listItems(sharedToMobile: true);
  }

  Future<List<PocketItem>> listItems({bool? sharedToMobile}) async {
    final queryParameters = <String, String>{};
    if (sharedToMobile != null) {
      queryParameters['sharedToMobile'] = sharedToMobile.toString();
    }

    final response = await _client.get(
      _uri('/api/items').replace(
        queryParameters: queryParameters.isEmpty ? null : queryParameters,
      ),
      headers: _authHeaders,
    );
    return _itemsFromResponse(response);
  }

  Future<PocketDownloadedFile> download(PocketItem item) async {
    final downloadUrl = item.downloadUrl;
    if (downloadUrl == null || downloadUrl.isEmpty) {
      throw PocketApiException('Item has no download URL');
    }

    final response = await _client.get(
      _uri(downloadUrl),
      headers: _authHeaders,
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw PocketApiException(
        _errorMessage(response),
        statusCode: response.statusCode,
      );
    }

    return PocketDownloadedFile(
      filename:
          _filenameFromHeaders(response.headers) ??
          item.originalFilename ??
          item.title,
      bytes: response.bodyBytes,
      contentType:
          response.headers['content-type'] ?? 'application/octet-stream',
    );
  }

  Uri websocketUri() {
    final uri = Uri.parse(pairing.wsUrl);
    return uri.replace(
      queryParameters: {
        ...uri.queryParameters,
        'pairCode': pairing.pairCode,
        'client': 'mobile',
      },
    );
  }

  void close() => _client.close();

  Map<String, String> get _authHeaders => {
    'X-PocketBridge-Pair-Code': pairing.pairCode,
  };

  Uri _uri(String path) => Uri.parse(pairing.serverBaseUrl).resolve(path);

  static Uri _pairingUri(String serverInput) {
    var value = serverInput.trim();
    if (value.isEmpty) {
      throw const FormatException('Server URL is required');
    }
    if (!value.startsWith('http://') && !value.startsWith('https://')) {
      value = 'http://$value';
    }

    final uri = Uri.parse(value);
    if (uri.path == '/api/pairing') return uri;

    return Uri(
      scheme: uri.scheme,
      host: uri.host,
      port: uri.hasPort ? uri.port : null,
      path: '/api/pairing',
    );
  }
}

Stream<List<int>> _trackProgress(
  Stream<List<int>> source,
  int totalBytes,
  void Function(int sentBytes, int totalBytes)? onProgress,
) {
  if (onProgress == null) return source;

  var sentBytes = 0;
  return source.transform(
    StreamTransformer.fromHandlers(
      handleData: (chunk, sink) {
        sentBytes += chunk.length;
        onProgress(sentBytes, totalBytes);
        sink.add(chunk);
      },
    ),
  );
}

PocketItem _itemFromResponse(http.Response response) {
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw PocketApiException(
      _errorMessage(response),
      statusCode: response.statusCode,
    );
  }
  return _itemFromBody(response.body);
}

PocketItem _itemFromBody(String body) {
  final decoded = jsonDecode(body);
  if (decoded is! Map<String, dynamic> ||
      decoded['item'] is! Map<String, dynamic>) {
    throw const FormatException('Item response must include item object');
  }
  return PocketItem.fromJson(decoded['item'] as Map<String, dynamic>);
}

List<PocketItem> _itemsFromResponse(http.Response response) {
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw PocketApiException(
      _errorMessage(response),
      statusCode: response.statusCode,
    );
  }

  final decoded = jsonDecode(response.body);
  if (decoded is! Map<String, dynamic> || decoded['items'] is! List) {
    throw const FormatException('Items response must include items[]');
  }
  return (decoded['items'] as List)
      .whereType<Map<String, dynamic>>()
      .map(PocketItem.fromJson)
      .toList(growable: false);
}

String _errorMessage(http.Response response) =>
    _errorMessageFromBody(response.body, response.reasonPhrase);

String _errorMessageFromBody(String body, String? fallback) {
  try {
    final decoded = jsonDecode(body);
    if (decoded is Map<String, dynamic>) {
      final error = decoded['error'];
      if (error is Map<String, dynamic> && error['message'] is String) {
        return error['message'] as String;
      }
      if (decoded['message'] is String) return decoded['message'] as String;
    }
  } catch (_) {
    // Keep the server status text below.
  }
  return fallback ?? 'Request failed';
}

MediaType? _mediaTypeFor(PlatformFile file) {
  final path = file.path ?? file.name;
  final mimeType = lookupMimeType(path);
  if (mimeType == null) return null;
  final parts = mimeType.split('/');
  if (parts.length != 2) return null;
  return MediaType(parts[0], parts[1]);
}

String? _filenameFromHeaders(Map<String, String> headers) {
  final disposition = headers['content-disposition'];
  if (disposition == null) return null;

  return _extendedFilename(disposition) ?? _basicFilename(disposition);
}

String? _extendedFilename(String disposition) {
  final match = RegExp(
    r'''(?:^|;)\s*filename\*\s*=\s*(?:"([^"]+)"|([^;]+))''',
    caseSensitive: false,
  ).firstMatch(disposition);
  final value = match?.group(1) ?? match?.group(2);
  if (value == null) return null;

  final trimmed = value.trim();
  final firstQuote = trimmed.indexOf("'");
  final secondQuote = firstQuote < 0
      ? -1
      : trimmed.indexOf("'", firstQuote + 1);
  final encoded = secondQuote >= 0
      ? trimmed.substring(secondQuote + 1)
      : trimmed;

  try {
    return _nonEmpty(Uri.decodeComponent(encoded));
  } on FormatException {
    return _nonEmpty(encoded);
  }
}

String? _basicFilename(String disposition) {
  final match = RegExp(
    r'''(?:^|;)\s*filename\s*=\s*(?:"((?:\\.|[^"])*)"|([^;]+))''',
    caseSensitive: false,
  ).firstMatch(disposition);
  final value = match?.group(1) ?? match?.group(2);
  if (value == null) return null;

  return _nonEmpty(
    value.trim().replaceAllMapped(RegExp(r'\\(.)'), (match) => match.group(1)!),
  );
}

String? _nonEmpty(String value) {
  return value.isEmpty ? null : value;
}
