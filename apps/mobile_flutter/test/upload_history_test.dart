import 'package:flutter_test/flutter_test.dart';
import 'package:pocketbridge_mobile/upload_history.dart';

void main() {
  test('encodes and decodes upload history entries', () {
    final entries = [
      UploadHistoryEntry(
        title: 'Idea',
        kind: 'text',
        createdAt: DateTime.parse('2026-06-27T12:00:00.000Z'),
        success: true,
      ),
      UploadHistoryEntry(
        title: 'receipt.png',
        kind: 'file',
        createdAt: DateTime.parse('2026-06-27T12:01:00.000Z'),
        success: false,
        detail: 'Network failed',
      ),
    ];

    final decoded = decodeUploadHistory(encodeUploadHistory(entries));

    expect(decoded, hasLength(2));
    expect(decoded.first.title, 'Idea');
    expect(decoded.first.statusLabel, 'Uploaded');
    expect(decoded.last.detail, 'Network failed');
    expect(decoded.last.statusLabel, 'Failed');
  });

  test('caps upload history to the requested limit', () {
    final entries = List.generate(
      12,
      (index) => UploadHistoryEntry(
        title: 'Upload $index',
        kind: 'text',
        createdAt: DateTime.parse('2026-06-27T12:00:00.000Z'),
        success: true,
      ),
    );

    final capped = cappedUploadHistory(entries, limit: 10);

    expect(capped, hasLength(10));
    expect(capped.first.title, 'Upload 0');
    expect(capped.last.title, 'Upload 9');
  });

  test('rejects malformed history payloads', () {
    expect(() => decodeUploadHistory('{}'), throwsFormatException);
  });
}
