import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pocketbridge_mobile/main.dart';
import 'package:pocketbridge_mobile/pocket_models.dart';
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

  testWidgets('shared page shows per-item download progress', (tester) async {
    final item = _sharedFileItem();

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SharedPage(
            paired: true,
            busy: true,
            items: [item],
            downloadProgressByItem: {item.id: 0.5},
            onRefresh: () async {},
            onDownload: (_) {},
          ),
        ),
      ),
    );

    expect(find.text('Shared report.pdf'), findsOneWidget);
    expect(find.text('Downloading 50%'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.byIcon(Icons.download), findsNothing);
  });
}

PocketItem _sharedFileItem() {
  return PocketItem(
    id: 'itm_1782547200000_b7e2c31a',
    kind: 'file',
    title: 'Shared report.pdf',
    origin: 'mac',
    sourceDevice: 'Pinkmans-Mac',
    tags: const ['demo'],
    sharedToMobile: true,
    status: 'inbox',
    createdAt: DateTime.parse('2026-06-27T12:00:00.000Z'),
    updatedAt: DateTime.parse('2026-06-27T12:00:00.000Z'),
    mimeType: 'application/pdf',
    sizeBytes: 3,
    originalFilename: 'report.pdf',
    storageRelPath: 'inbox/2026-06-27/itm_1782547200000_b7e2c31a/original',
    downloadUrl: '/api/items/itm_1782547200000_b7e2c31a/download',
  );
}
