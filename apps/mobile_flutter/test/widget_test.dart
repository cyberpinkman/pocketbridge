import 'package:flutter_test/flutter_test.dart';
import 'package:pocketbridge_mobile/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('shows pairing entry point when no pairing is stored', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});

    await tester.pumpWidget(const PocketBridgeApp());
    await tester.pumpAndSettle();

    expect(find.text('PocketBridge'), findsOneWidget);
    expect(find.text('Pair this phone'), findsOneWidget);
    expect(find.text('Scan QR'), findsOneWidget);
  });
}
