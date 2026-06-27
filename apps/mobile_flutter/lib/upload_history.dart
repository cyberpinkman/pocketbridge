import 'dart:convert';

class UploadHistoryEntry {
  const UploadHistoryEntry({
    required this.title,
    required this.kind,
    required this.createdAt,
    required this.success,
    this.detail,
  });

  final String title;
  final String kind;
  final DateTime createdAt;
  final bool success;
  final String? detail;

  factory UploadHistoryEntry.fromJson(Map<String, dynamic> json) {
    return UploadHistoryEntry(
      title: _stringOr(json['title'], 'Untitled upload'),
      kind: _stringOr(json['kind'], 'file'),
      createdAt:
          DateTime.tryParse(_stringOr(json['createdAt'], '')) ??
          DateTime.fromMillisecondsSinceEpoch(0),
      success: json['success'] == true,
      detail: json['detail'] is String ? json['detail'] as String : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'title': title,
      'kind': kind,
      'createdAt': createdAt.toIso8601String(),
      'success': success,
      if (detail != null && detail!.isNotEmpty) 'detail': detail,
    };
  }

  String get statusLabel => success ? 'Uploaded' : 'Failed';
}

String encodeUploadHistory(List<UploadHistoryEntry> entries) {
  return jsonEncode(entries.map((entry) => entry.toJson()).toList());
}

List<UploadHistoryEntry> decodeUploadHistory(String? encoded) {
  if (encoded == null || encoded.trim().isEmpty) return const [];

  final decoded = jsonDecode(encoded);
  if (decoded is! List) {
    throw const FormatException('Upload history must be a JSON array');
  }

  return decoded
      .whereType<Map<String, dynamic>>()
      .map(UploadHistoryEntry.fromJson)
      .toList(growable: false);
}

List<UploadHistoryEntry> cappedUploadHistory(
  List<UploadHistoryEntry> entries, {
  int limit = 10,
}) {
  if (entries.length <= limit) return List.unmodifiable(entries);
  return List.unmodifiable(entries.take(limit));
}

String _stringOr(Object? value, String fallback) {
  if (value is String && value.trim().isNotEmpty) return value;
  return fallback;
}
