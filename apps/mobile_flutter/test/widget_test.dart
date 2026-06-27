import 'package:flutter/material.dart';
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

  testWidgets('paired capture page exposes separate image and file pickers', (
    tester,
  ) async {
    final titleController = TextEditingController(text: 'Phone note');
    final textController = TextEditingController();
    addTearDown(titleController.dispose);
    addTearDown(textController.dispose);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: CapturePage(
            paired: true,
            busy: false,
            uploadProgress: null,
            activeFilePreview: null,
            recentUploads: const [],
            failedUploadTitle: null,
            titleController: titleController,
            textController: textController,
            onScan: () {},
            onUploadText: () {},
            onUploadImage: () {},
            onUploadFile: () {},
            onRetryFailedUpload: null,
          ),
        ),
      ),
    );

    expect(find.text('Upload Text'), findsOneWidget);
    expect(find.text('Pick Image'), findsOneWidget);
    expect(find.text('Pick File'), findsOneWidget);
    expect(find.text('Upload Image or File'), findsNothing);
  });
}
