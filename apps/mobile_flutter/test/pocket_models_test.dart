import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:pocketbridge_mobile/pocket_models.dart';

void main() {
  test('parses canonical QR pairing payload', () {
    final pairing = PairingInfo.fromQrText(
      jsonEncode({
        'protocol': 'pocketbridge',
        'version': 1,
        'serverBaseUrl': 'http://192.168.1.23:3000',
        'wsUrl': 'ws://192.168.1.23:3000/ws',
        'pairCode': '123456',
        'deviceName': 'Pinkmans-Mac',
        'expiresAt': '2026-06-27T12:30:00.000Z',
        'capabilities': ['upload', 'download', 'websocket'],
      }),
    );

    expect(pairing.serverBaseUrl, 'http://192.168.1.23:3000');
    expect(pairing.wsUrl, 'ws://192.168.1.23:3000/ws');
    expect(pairing.pairCode, '123456');
    expect(pairing.capabilities, contains('websocket'));
  });

  test('rejects non PocketBridge QR payloads', () {
    expect(
      () => PairingInfo.fromQrText(jsonEncode({'protocol': 'other'})),
      throwsFormatException,
    );
  });

  test('parses canonical PocketItem shape', () {
    final item = PocketItem.fromJson({
      'id': 'itm_1782547200000_a9f4c21b',
      'kind': 'image',
      'title': 'Screenshot.png',
      'origin': 'mac',
      'sourceDevice': 'Pinkmans-Mac',
      'mimeType': 'image/png',
      'sizeBytes': 481223,
      'originalFilename': 'Screenshot.png',
      'storageRelPath': 'inbox/2026-06-27/itm_1782547200000_a9f4c21b/original',
      'tags': ['demo'],
      'sharedToMobile': true,
      'status': 'inbox',
      'createdAt': '2026-06-27T12:00:00.000Z',
      'updatedAt': '2026-06-27T12:00:00.000Z',
      'archivedAt': '2026-06-27T12:05:00.000Z',
      'downloadUrl': '/api/items/itm_1782547200000_a9f4c21b/download',
    });

    expect(item.downloadable, isTrue);
    expect(item.origin, 'mac');
    expect(item.tags, ['demo']);
    expect(item.archivedAt, DateTime.parse('2026-06-27T12:05:00.000Z'));
  });
}
