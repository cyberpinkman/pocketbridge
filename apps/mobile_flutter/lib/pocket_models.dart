import 'dart:convert';

class PairingInfo {
  PairingInfo({
    required this.serverBaseUrl,
    required this.wsUrl,
    required this.pairCode,
    required this.deviceName,
    required this.expiresAt,
    required this.capabilities,
  });

  final String serverBaseUrl;
  final String wsUrl;
  final String pairCode;
  final String deviceName;
  final DateTime? expiresAt;
  final List<String> capabilities;

  factory PairingInfo.fromQrText(String text) {
    final decoded = jsonDecode(text);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('QR payload must be a JSON object');
    }
    return PairingInfo.fromJson(decoded);
  }

  factory PairingInfo.fromJson(Map<String, dynamic> json) {
    final protocol = json['protocol'];
    final version = json['version'];
    if (protocol != 'pocketbridge' || version != 1) {
      throw const FormatException('Not a PocketBridge pairing payload');
    }

    return PairingInfo(
      serverBaseUrl: _requiredString(json, 'serverBaseUrl'),
      wsUrl: _requiredString(json, 'wsUrl'),
      pairCode: _requiredString(json, 'pairCode'),
      deviceName: _stringOr(json['deviceName'], 'PocketBridge Mac'),
      expiresAt: DateTime.tryParse(_stringOr(json['expiresAt'], '')),
      capabilities: _stringList(json['capabilities']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'protocol': 'pocketbridge',
      'version': 1,
      'serverBaseUrl': serverBaseUrl,
      'wsUrl': wsUrl,
      'pairCode': pairCode,
      'deviceName': deviceName,
      'expiresAt': expiresAt?.toIso8601String(),
      'capabilities': capabilities,
    };
  }

  String encode() => jsonEncode(toJson());
}

class PocketItem {
  PocketItem({
    required this.id,
    required this.kind,
    required this.title,
    required this.origin,
    required this.sourceDevice,
    required this.tags,
    required this.sharedToMobile,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.mimeType,
    this.sizeBytes,
    this.originalFilename,
    this.storageRelPath,
    this.text,
    this.downloadUrl,
    this.knowledgePath,
  });

  final String id;
  final String kind;
  final String title;
  final String origin;
  final String sourceDevice;
  final String? mimeType;
  final int? sizeBytes;
  final String? originalFilename;
  final String? storageRelPath;
  final String? text;
  final List<String> tags;
  final bool sharedToMobile;
  final String status;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String? downloadUrl;
  final String? knowledgePath;

  factory PocketItem.fromJson(Map<String, dynamic> json) {
    return PocketItem(
      id: _requiredString(json, 'id'),
      kind: _requiredString(json, 'kind'),
      title: _requiredString(json, 'title'),
      origin: _requiredString(json, 'origin'),
      sourceDevice: _requiredString(json, 'sourceDevice'),
      mimeType: json['mimeType'] as String?,
      sizeBytes: json['sizeBytes'] as int?,
      originalFilename: json['originalFilename'] as String?,
      storageRelPath: json['storageRelPath'] as String?,
      text: json['text'] as String?,
      tags: _stringList(json['tags']),
      sharedToMobile: json['sharedToMobile'] == true,
      status: _requiredString(json, 'status'),
      createdAt: DateTime.parse(_requiredString(json, 'createdAt')),
      updatedAt: DateTime.parse(_requiredString(json, 'updatedAt')),
      downloadUrl: json['downloadUrl'] as String?,
      knowledgePath: json['knowledgePath'] as String?,
    );
  }

  bool get downloadable => downloadUrl != null && downloadUrl!.isNotEmpty;
}

class PocketDownloadedFile {
  PocketDownloadedFile({
    required this.filename,
    required this.bytes,
    required this.contentType,
  });

  final String filename;
  final List<int> bytes;
  final String contentType;
}

String _requiredString(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is! String || value.trim().isEmpty) {
    throw FormatException('$key is required');
  }
  return value;
}

String _stringOr(Object? value, String fallback) {
  if (value is String && value.trim().isNotEmpty) {
    return value;
  }
  return fallback;
}

List<String> _stringList(Object? value) {
  if (value is List) {
    return value.map((entry) => entry.toString()).toList(growable: false);
  }
  return const [];
}
