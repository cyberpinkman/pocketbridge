import 'package:flutter/services.dart';

const String pocketBridgeTransferServiceUuid =
    '6f8f8e11-07bb-4f0c-b9a9-54f5af7d9c31';
const String pocketKeyServiceUuid =
    '6f8f8e21-07bb-4f0c-b9a9-54f5af7d9c31';

class RealBleClient {
  RealBleClient({MethodChannel? channel})
      : _channel = channel ?? const MethodChannel('pocketbridge/ble');

  final MethodChannel _channel;

  Future<String> startDemo({required String deviceName}) async {
    final result = await _channel.invokeMethod<String>('startDemo', {
      'deviceName': deviceName,
      'transferServiceUuid': pocketBridgeTransferServiceUuid,
      'pocketKeyServiceUuid': pocketKeyServiceUuid,
    });
    return result ?? 'BLE demo started';
  }

  Future<String> stopDemo() async {
    final result = await _channel.invokeMethod<String>('stopDemo');
    return result ?? 'BLE demo stopped';
  }
}
