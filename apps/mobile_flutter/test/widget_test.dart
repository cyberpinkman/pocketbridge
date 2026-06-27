import 'package:flutter_test/flutter_test.dart';
import 'package:pocketbridge_mobile/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('shows pairing screen and bottom navigation entry points', (tester) async {
    SharedPreferences.setMockInitialValues({});

    await tester.pumpWidget(const PocketBridgeApp());

    expect(find.text('PocketBridge'), findsOneWidget);
    expect(find.text('Pair with Mac'), findsOneWidget);
    expect(find.text('Scan QR'), findsOneWidget);
    expect(find.text('Pairing'), findsOneWidget);
    expect(find.text('Capture'), findsOneWidget);
    expect(find.text('Shared'), findsOneWidget);
  });
}
