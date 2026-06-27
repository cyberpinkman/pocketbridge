import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'pocket_api.dart';
import 'pocket_models.dart';
import 'upload_history.dart';

const _pairingPrefsKey = 'pocketbridge.pairing';
const _uploadHistoryPrefsKey = 'pocketbridge.uploadHistory';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const PocketBridgeApp());
}

class PocketBridgeApp extends StatelessWidget {
  const PocketBridgeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'PocketBridge',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF006A60)),
        useMaterial3: true,
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(),
        ),
      ),
      home: const PocketBridgeHome(),
    );
  }
}

class PocketBridgeHome extends StatefulWidget {
  const PocketBridgeHome({super.key});

  @override
  State<PocketBridgeHome> createState() => _PocketBridgeHomeState();
}

class _PocketBridgeHomeState extends State<PocketBridgeHome> {
  final _manualServerController = TextEditingController();
  final _titleController = TextEditingController(text: 'Phone note');
  final _textController = TextEditingController();

  PairingInfo? _pairing;
  PocketBridgeApi? _api;
  WebSocketChannel? _socket;
  StreamSubscription<dynamic>? _socketSubscription;
  Timer? _reconnectTimer;
  List<PocketItem> _sharedItems = const [];
  List<UploadHistoryEntry> _recentUploads = const [];
  _PendingUpload? _lastFailedUpload;
  PlatformFile? _activeFilePreview;
  int _selectedIndex = 0;
  bool _loading = true;
  bool _busy = false;
  double? _uploadProgress;
  String _status = 'Loading';

  String get _sourceDevice =>
      Platform.isAndroid ? 'PocketBridge Android' : 'PocketBridge Phone';

  @override
  void initState() {
    super.initState();
    unawaited(_loadStoredPairing());
  }

  @override
  void dispose() {
    _manualServerController.dispose();
    _titleController.dispose();
    _textController.dispose();
    _disconnectSocket();
    _api?.close();
    super.dispose();
  }

  Future<void> _loadStoredPairing() async {
    final prefs = await SharedPreferences.getInstance();
    final encoded = prefs.getString(_pairingPrefsKey);
    final recentUploads = _storedUploadHistory(prefs);
    if (mounted) {
      setState(() => _recentUploads = recentUploads);
    }
    if (encoded == null) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _status = 'Not paired';
      });
      return;
    }

    try {
      final decoded = jsonDecode(encoded);
      if (decoded is! Map<String, dynamic>) {
        throw const FormatException('Stored pairing is invalid');
      }
      await _applyPairing(PairingInfo.fromJson(decoded), persist: false);
    } catch (error) {
      await prefs.remove(_pairingPrefsKey);
      if (!mounted) return;
      setState(() {
        _loading = false;
        _status = _message(error);
      });
    }
  }

  Future<void> _applyPairing(PairingInfo pairing, {bool persist = true}) async {
    final nextApi = PocketBridgeApi(pairing);
    if (!mounted) {
      nextApi.close();
      return;
    }
    setState(() {
      _manualServerController.text = pairing.serverBaseUrl;
      _status = 'Checking ${pairing.deviceName}';
    });

    try {
      await nextApi.checkHealth();
      await nextApi.listItems();
      final sharedItems = await nextApi.listSharedItems();

      if (persist) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(_pairingPrefsKey, pairing.encode());
      }

      final previousApi = _api;
      _disconnectSocket();
      previousApi?.close();

      if (!mounted) {
        nextApi.close();
        return;
      }
      setState(() {
        _pairing = pairing;
        _api = nextApi;
        _sharedItems = sharedItems;
        _loading = false;
        _status = 'Connected to ${pairing.deviceName}';
      });
      _connectSocket();
    } catch (_) {
      nextApi.close();
      rethrow;
    }
  }

  Future<void> _pairFromQr() async {
    final pairing = await Navigator.of(context).push<PairingInfo>(
      MaterialPageRoute(builder: (_) => const QrScannerPage()),
    );
    if (pairing != null) {
      await _run(() => _applyPairing(pairing));
    }
  }

  Future<void> _pairManually() async {
    final input = _manualServerController.text.trim();
    await _run(() async {
      final pairing = input.startsWith('{')
          ? PairingInfo.fromQrText(input)
          : await PocketBridgeApi.fetchPairingFromServer(input);
      await _applyPairing(pairing);
    });
  }

  Future<void> _forgetPairing() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_pairingPrefsKey);
    _api?.close();
    _disconnectSocket();
    if (!mounted) return;
    setState(() {
      _pairing = null;
      _api = null;
      _sharedItems = const [];
      _status = 'Not paired';
      _selectedIndex = 0;
    });
  }

  void _connectSocket() {
    final api = _api;
    if (api == null) return;

    _disconnectSocket();
    final socket = WebSocketChannel.connect(api.websocketUri());
    _socket = socket;
    _socketSubscription = socket.stream.listen(
      (message) {
        final type = _eventType(message);
        if (type == 'pairing.connected') {
          setState(() => _status = 'Live connection ready');
        }
        if (type == 'item.created' ||
            type == 'item.updated' ||
            type == 'item.shared' ||
            type == 'item.deleted' ||
            type == 'knowledge.saved') {
          unawaited(_loadSharedItems(silent: true));
        }
      },
      onError: (Object error) {
        if (!mounted) return;
        setState(() => _status = _message(error));
        _scheduleReconnect();
      },
      onDone: _scheduleReconnect,
      cancelOnError: true,
    );
  }

  void _scheduleReconnect() {
    if (_pairing == null || _reconnectTimer != null) return;
    if (mounted) {
      setState(() => _status = 'Socket disconnected; retrying');
    }
    _reconnectTimer = Timer(const Duration(seconds: 2), () {
      _reconnectTimer = null;
      if (mounted && _pairing != null) _connectSocket();
    });
  }

  void _disconnectSocket() {
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    unawaited(_socketSubscription?.cancel());
    _socketSubscription = null;
    unawaited(_socket?.sink.close());
    _socket = null;
  }

  Future<void> _uploadText() async {
    final text = _textController.text.trim();
    if (text.isEmpty) {
      _showSnack('Text is required');
      return;
    }

    final title = _titleController.text.trim().isEmpty
        ? 'Phone note'
        : _titleController.text.trim();
    await _submitUpload(_PendingUpload.text(title: title, text: text));
  }

  Future<void> _uploadImage() async {
    await _uploadPickedFile(type: FileType.image);
  }

  Future<void> _uploadFile() async {
    await _uploadPickedFile(type: FileType.any);
  }

  Future<void> _uploadPickedFile({required FileType type}) async {
    final picked = await FilePicker.platform.pickFiles(
      type: type,
      withReadStream: true,
    );
    final file = picked?.files.single;
    if (file == null) return;
    if (mounted) {
      setState(() => _activeFilePreview = file);
    }

    await _submitUpload(_PendingUpload.file(file));
  }

  Future<void> _submitUpload(
    _PendingUpload upload, {
    bool retry = false,
  }) async {
    final api = _requireApi();
    await _run(() async {
      if (mounted) {
        setState(() {
          _uploadProgress = upload.kind == 'file' ? 0 : null;
        });
      }

      try {
        if (upload.kind == 'text') {
          await api.uploadText(
            title: upload.title,
            text: upload.text!,
            sourceDevice: _sourceDevice,
          );
          _textController.clear();
        } else {
          await api.uploadFile(
            file: upload.fileForAttempt(retry: retry),
            sourceDevice: _sourceDevice,
            onProgress: (sentBytes, totalBytes) {
              if (!mounted || totalBytes <= 0) return;
              setState(() {
                _uploadProgress = (sentBytes / totalBytes).clamp(0, 1);
              });
            },
          );
        }

        await _addUploadHistory(
          title: upload.title,
          kind: upload.kind,
          success: true,
        );
        if (mounted) {
          setState(() {
            _lastFailedUpload = null;
            if (upload.kind == 'file') _activeFilePreview = null;
            _status = 'Uploaded ${upload.title}';
          });
        }
        _showSnack('Uploaded: ${upload.title}');
      } catch (error) {
        final message = _message(error);
        await _addUploadHistory(
          title: upload.title,
          kind: upload.kind,
          success: false,
          detail: message,
        );
        if (mounted) {
          setState(() => _lastFailedUpload = upload.retryable ? upload : null);
        }
        rethrow;
      } finally {
        if (mounted) setState(() => _uploadProgress = null);
      }
    });
  }

  Future<void> _retryLastFailedUpload() async {
    final upload = _lastFailedUpload;
    if (upload == null) return;
    await _submitUpload(upload, retry: true);
  }

  Future<void> _addUploadHistory({
    required String title,
    required String kind,
    required bool success,
    String? detail,
  }) async {
    final entry = UploadHistoryEntry(
      title: title,
      kind: kind,
      createdAt: DateTime.now(),
      success: success,
      detail: detail,
    );
    final next = cappedUploadHistory([entry, ..._recentUploads]);
    if (mounted) {
      setState(() => _recentUploads = next);
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_uploadHistoryPrefsKey, encodeUploadHistory(next));
  }

  Future<void> _loadSharedItems({bool silent = false}) async {
    final api = _api;
    if (api == null) return;

    await _run(() async {
      final items = await api.listSharedItems();
      if (!mounted) return;
      setState(() => _sharedItems = items);
    }, busy: !silent);
  }

  Future<void> _downloadItem(PocketItem item) async {
    final api = _requireApi();
    await _run(() async {
      final directory = await getApplicationDocumentsDirectory();
      final downloaded = await api.downloadToDirectory(item, directory);
      _showSnack('Downloaded: ${downloaded.filename}');
      unawaited(OpenFilex.open(downloaded.path, type: downloaded.contentType));
    });
  }

  Future<void> _run(Future<void> Function() action, {bool busy = true}) async {
    if (busy) setState(() => _busy = true);
    try {
      await action();
    } catch (error) {
      if (!mounted) return;
      setState(() => _status = _message(error));
      _showSnack(_message(error));
    } finally {
      if (mounted && busy) setState(() => _busy = false);
    }
  }

  PocketBridgeApi _requireApi() {
    final api = _api;
    if (api == null) throw PocketApiException('Pair with a Mac first');
    return api;
  }

  void _showSnack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final paired = _pairing != null;
    final pages = [
      CapturePage(
        paired: paired,
        busy: _busy,
        uploadProgress: _uploadProgress,
        activeFilePreview: _activeFilePreview,
        recentUploads: _recentUploads,
        failedUploadTitle: _lastFailedUpload?.title,
        titleController: _titleController,
        textController: _textController,
        onScan: _pairFromQr,
        onUploadText: _uploadText,
        onUploadImage: _uploadImage,
        onUploadFile: _uploadFile,
        onRetryFailedUpload: _lastFailedUpload == null
            ? null
            : _retryLastFailedUpload,
      ),
      _SharedPage(
        paired: paired,
        busy: _busy,
        items: _sharedItems,
        onRefresh: () => _loadSharedItems(),
        onDownload: _downloadItem,
      ),
      _PairingPage(
        pairing: _pairing,
        status: _status,
        busy: _busy,
        controller: _manualServerController,
        onScan: _pairFromQr,
        onManualPair: _pairManually,
        onHealthCheck: () async {
          final api = _requireApi();
          await _run(() async {
            await api.checkHealth();
            setState(() => _status = 'Server healthy');
          });
        },
        onForget: _forgetPairing,
      ),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('PocketBridge'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Center(
              child: _StatusChip(text: _status, paired: paired),
            ),
          ),
        ],
      ),
      body: SafeArea(child: pages[_selectedIndex]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedIndex,
        onDestinationSelected: (index) =>
            setState(() => _selectedIndex = index),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.send_outlined),
            selectedIcon: Icon(Icons.send),
            label: 'Capture',
          ),
          NavigationDestination(
            icon: Icon(Icons.folder_shared_outlined),
            selectedIcon: Icon(Icons.folder_shared),
            label: 'Shared',
          ),
          NavigationDestination(
            icon: Icon(Icons.qr_code_scanner),
            selectedIcon: Icon(Icons.qr_code_2),
            label: 'Pair',
          ),
        ],
      ),
    );
  }
}

class CapturePage extends StatelessWidget {
  const CapturePage({
    super.key,
    required this.paired,
    required this.busy,
    required this.uploadProgress,
    required this.activeFilePreview,
    required this.recentUploads,
    required this.failedUploadTitle,
    required this.titleController,
    required this.textController,
    required this.onScan,
    required this.onUploadText,
    required this.onUploadImage,
    required this.onUploadFile,
    required this.onRetryFailedUpload,
  });

  final bool paired;
  final bool busy;
  final double? uploadProgress;
  final PlatformFile? activeFilePreview;
  final List<UploadHistoryEntry> recentUploads;
  final String? failedUploadTitle;
  final TextEditingController titleController;
  final TextEditingController textController;
  final VoidCallback onScan;
  final VoidCallback onUploadText;
  final VoidCallback onUploadImage;
  final VoidCallback onUploadFile;
  final VoidCallback? onRetryFailedUpload;

  @override
  Widget build(BuildContext context) {
    if (!paired) {
      return _EmptyState(
        icon: Icons.qr_code_scanner,
        title: 'Pair this phone',
        body: 'Scan the Mac QR code or enter the Mac server URL.',
        actionLabel: 'Scan QR',
        onAction: onScan,
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        TextField(
          controller: titleController,
          decoration: const InputDecoration(labelText: 'Title'),
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: 12),
        TextField(
          controller: textController,
          decoration: const InputDecoration(labelText: 'Text capture'),
          minLines: 5,
          maxLines: 10,
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: busy ? null : onUploadText,
          icon: const Icon(Icons.send),
          label: const Text('Upload Text'),
        ),
        const SizedBox(height: 24),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: busy ? null : onUploadImage,
                icon: const Icon(Icons.image_outlined),
                label: const Text('Pick Image'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: busy ? null : onUploadFile,
                icon: const Icon(Icons.attach_file),
                label: const Text('Pick File'),
              ),
            ),
          ],
        ),
        if (activeFilePreview != null) ...[
          const SizedBox(height: 12),
          _FilePreview(file: activeFilePreview!),
        ],
        if (uploadProgress != null) ...[
          const SizedBox(height: 12),
          LinearProgressIndicator(value: uploadProgress),
          const SizedBox(height: 6),
          Text(
            'Uploading ${((uploadProgress ?? 0) * 100).round()}%',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
        if (failedUploadTitle != null && onRetryFailedUpload != null) ...[
          const SizedBox(height: 16),
          Card(
            child: ListTile(
              leading: const Icon(Icons.refresh),
              title: Text('Retry failed upload'),
              subtitle: Text(failedUploadTitle!),
              trailing: FilledButton(
                onPressed: busy ? null : onRetryFailedUpload,
                child: const Text('Retry'),
              ),
            ),
          ),
        ],
        if (recentUploads.isNotEmpty) ...[
          const SizedBox(height: 24),
          Text(
            'Recent uploads',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          ...recentUploads.map((entry) => _UploadHistoryTile(entry: entry)),
        ],
      ],
    );
  }
}

class _FilePreview extends StatelessWidget {
  const _FilePreview({required this.file});

  final PlatformFile file;

  @override
  Widget build(BuildContext context) {
    final imagePath = _isImageFile(file.name) ? file.path : null;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (imagePath != null)
            AspectRatio(
              aspectRatio: 16 / 9,
              child: Image.file(File(imagePath), fit: BoxFit.cover),
            ),
          ListTile(
            leading: Icon(
              _isImageFile(file.name)
                  ? Icons.image_outlined
                  : Icons.insert_drive_file_outlined,
            ),
            title: Text(
              file.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            subtitle: Text(_formatBytes(file.size)),
          ),
        ],
      ),
    );
  }
}

class _UploadHistoryTile extends StatelessWidget {
  const _UploadHistoryTile({required this.entry});

  final UploadHistoryEntry entry;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Card(
      child: ListTile(
        dense: true,
        leading: Icon(
          entry.success ? Icons.check_circle_outline : Icons.error_outline,
          color: entry.success ? colorScheme.primary : colorScheme.error,
        ),
        title: Text(entry.title, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text(
          '${entry.statusLabel} / ${entry.kind} / ${_formatDate(entry.createdAt)}'
          '${entry.detail == null ? '' : '\n${entry.detail}'}',
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
      ),
    );
  }
}

class _SharedPage extends StatelessWidget {
  const _SharedPage({
    required this.paired,
    required this.busy,
    required this.items,
    required this.onRefresh,
    required this.onDownload,
  });

  final bool paired;
  final bool busy;
  final List<PocketItem> items;
  final Future<void> Function() onRefresh;
  final ValueChanged<PocketItem> onDownload;

  @override
  Widget build(BuildContext context) {
    if (!paired) {
      return const _EmptyState(
        icon: Icons.folder_off_outlined,
        title: 'No paired Mac',
        body: 'Shared Mac files appear here after pairing.',
      );
    }

    if (items.isEmpty) {
      return _EmptyState(
        icon: Icons.folder_shared_outlined,
        title: 'No shared files',
        body: 'Tap refresh after marking a Mac file as shared.',
        actionLabel: 'Refresh',
        onAction: busy ? null : () => unawaited(onRefresh()),
      );
    }

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView.separated(
        padding: const EdgeInsets.all(12),
        itemBuilder: (context, index) {
          final item = items[index];
          return ListTile(
            leading: CircleAvatar(child: Icon(_iconForKind(item.kind))),
            title: Text(
              item.title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            subtitle: Text(
              '${item.kind} / ${item.origin} / ${_formatDate(item.createdAt)}',
            ),
            trailing: IconButton.filledTonal(
              onPressed: item.downloadable && !busy
                  ? () => onDownload(item)
                  : null,
              icon: const Icon(Icons.download),
              tooltip: 'Download',
            ),
          );
        },
        separatorBuilder: (context, index) => const Divider(height: 1),
        itemCount: items.length,
      ),
    );
  }
}

class _PairingPage extends StatelessWidget {
  const _PairingPage({
    required this.pairing,
    required this.status,
    required this.busy,
    required this.controller,
    required this.onScan,
    required this.onManualPair,
    required this.onHealthCheck,
    required this.onForget,
  });

  final PairingInfo? pairing;
  final String status;
  final bool busy;
  final TextEditingController controller;
  final VoidCallback onScan;
  final VoidCallback onManualPair;
  final VoidCallback onHealthCheck;
  final VoidCallback onForget;

  @override
  Widget build(BuildContext context) {
    final currentPairing = pairing;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        FilledButton.icon(
          onPressed: busy ? null : onScan,
          icon: const Icon(Icons.qr_code_scanner),
          label: const Text('Scan Mac QR'),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: controller,
          decoration: const InputDecoration(
            labelText: 'Mac server URL or QR JSON',
            hintText: 'http://192.168.1.23:3000',
          ),
          keyboardType: TextInputType.url,
          minLines: 1,
          maxLines: 4,
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: busy ? null : onManualPair,
          icon: const Icon(Icons.link),
          label: const Text('Connect'),
        ),
        const SizedBox(height: 24),
        if (currentPairing != null) ...[
          _InfoRow(label: 'Device', value: currentPairing.deviceName),
          _InfoRow(label: 'Server', value: currentPairing.serverBaseUrl),
          _InfoRow(label: 'Pair code', value: currentPairing.pairCode),
          _InfoRow(label: 'Status', value: status),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: busy ? null : onHealthCheck,
            icon: const Icon(Icons.health_and_safety_outlined),
            label: const Text('Check Health'),
          ),
          TextButton.icon(
            onPressed: busy ? null : onForget,
            icon: const Icon(Icons.link_off),
            label: const Text('Forget Pairing'),
          ),
        ],
      ],
    );
  }
}

class QrScannerPage extends StatefulWidget {
  const QrScannerPage({super.key});

  @override
  State<QrScannerPage> createState() => _QrScannerPageState();
}

class _QrScannerPageState extends State<QrScannerPage> {
  final _controller = MobileScannerController(
    formats: const [BarcodeFormat.qrCode],
  );
  bool _handled = false;
  String? _error;

  @override
  void dispose() {
    unawaited(_controller.dispose());
    super.dispose();
  }

  void _handleCapture(BarcodeCapture capture) {
    if (_handled) return;

    for (final barcode in capture.barcodes) {
      final raw = barcode.rawValue;
      if (raw == null || raw.isEmpty) continue;

      try {
        final pairing = PairingInfo.fromQrText(raw);
        _handled = true;
        Navigator.of(context).pop(pairing);
        return;
      } catch (error) {
        setState(() => _error = _message(error));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scan PocketBridge QR'),
        actions: [
          IconButton(
            onPressed: () => _controller.toggleTorch(),
            icon: const Icon(Icons.flashlight_on_outlined),
            tooltip: 'Torch',
          ),
          IconButton(
            onPressed: () => _controller.switchCamera(),
            icon: const Icon(Icons.cameraswitch_outlined),
            tooltip: 'Switch camera',
          ),
        ],
      ),
      body: Stack(
        children: [
          MobileScanner(controller: _controller, onDetect: _handleCapture),
          Align(
            alignment: Alignment.bottomCenter,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              color: Colors.black.withValues(alpha: 0.66),
              child: Text(
                _error ?? 'Point the camera at the Mac pairing QR.',
                style: const TextStyle(color: Colors.white),
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.text, required this.paired});

  final String text;
  final bool paired;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Tooltip(
      message: text,
      child: Chip(
        avatar: Icon(
          paired ? Icons.circle : Icons.circle_outlined,
          size: 12,
          color: paired ? colorScheme.primary : colorScheme.error,
        ),
        label: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 150),
          child: Text(text, overflow: TextOverflow.ellipsis),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.icon,
    required this.title,
    required this.body,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String body;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: Theme.of(context).colorScheme.primary),
            const SizedBox(height: 12),
            Text(
              title,
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(body, textAlign: TextAlign.center),
            if (actionLabel != null) ...[
              const SizedBox(height: 16),
              FilledButton(onPressed: onAction, child: Text(actionLabel!)),
            ],
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 88,
            child: Text(label, style: Theme.of(context).textTheme.labelLarge),
          ),
          Expanded(child: SelectableText(value)),
        ],
      ),
    );
  }
}

class _PendingUpload {
  const _PendingUpload._({
    required this.kind,
    required this.title,
    this.text,
    this.file,
  });

  factory _PendingUpload.text({required String title, required String text}) {
    return _PendingUpload._(kind: 'text', title: title, text: text);
  }

  factory _PendingUpload.file(PlatformFile file) {
    return _PendingUpload._(kind: 'file', title: file.name, file: file);
  }

  final String kind;
  final String title;
  final String? text;
  final PlatformFile? file;

  bool get retryable {
    if (kind == 'text') return true;
    final selectedFile = file;
    return selectedFile?.path != null || selectedFile?.bytes != null;
  }

  PlatformFile fileForAttempt({required bool retry}) {
    final selectedFile = file;
    if (selectedFile == null) {
      throw PocketApiException('No file selected');
    }

    if (!retry) return selectedFile;
    if (selectedFile.path != null) {
      return PlatformFile(
        name: selectedFile.name,
        size: selectedFile.size,
        path: selectedFile.path,
      );
    }
    if (selectedFile.bytes != null) {
      return PlatformFile(
        name: selectedFile.name,
        size: selectedFile.size,
        bytes: selectedFile.bytes,
      );
    }

    throw PocketApiException('Pick the file again to retry');
  }
}

List<UploadHistoryEntry> _storedUploadHistory(SharedPreferences prefs) {
  try {
    return decodeUploadHistory(prefs.getString(_uploadHistoryPrefsKey));
  } catch (_) {
    return const [];
  }
}

IconData _iconForKind(String kind) {
  switch (kind) {
    case 'image':
    case 'screenshot':
      return Icons.image_outlined;
    case 'text':
      return Icons.notes_outlined;
    default:
      return Icons.insert_drive_file_outlined;
  }
}

String _formatDate(DateTime dateTime) {
  final local = dateTime.toLocal();
  String two(int value) => value.toString().padLeft(2, '0');
  return '${local.year}-${two(local.month)}-${two(local.day)} ${two(local.hour)}:${two(local.minute)}';
}

String _formatBytes(int bytes) {
  if (bytes < 1024) return '$bytes B';
  final kib = bytes / 1024;
  if (kib < 1024) return '${kib.toStringAsFixed(1)} KB';
  final mib = kib / 1024;
  return '${mib.toStringAsFixed(1)} MB';
}

bool _isImageFile(String filename) {
  final lower = filename.toLowerCase();
  return lower.endsWith('.png') ||
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.gif') ||
      lower.endsWith('.webp');
}

String _eventType(Object? message) {
  try {
    final decoded = jsonDecode(message.toString());
    if (decoded is Map<String, dynamic> && decoded['type'] is String) {
      return decoded['type'] as String;
    }
  } catch (_) {
    return '';
  }
  return '';
}

String _message(Object error) {
  if (error is PocketApiException) return error.message;
  if (error is FormatException) return error.message;
  if (error is SocketException) return error.message;
  return error.toString();
}
