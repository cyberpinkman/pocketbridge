import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:web_socket_channel/io.dart';

import 'pocket_api.dart';
import 'pocket_models.dart';
import 'real_ble_client.dart';

const _pairingPrefsKey = 'pocketbridge.pairing';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const PocketBridgeApp());
}

class PocketBridgeApp extends StatelessWidget {
  const PocketBridgeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'PocketBridge',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF078B86)),
        useMaterial3: true,
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
  final TextEditingController _bridgeUrlController =
      TextEditingController(text: 'http://127.0.0.1:3000');
  final TextEditingController _pairingPayloadController = TextEditingController();
  final TextEditingController _deviceNameController =
      TextEditingController(text: 'Demo Phone');
  final TextEditingController _ideaController = TextEditingController();

  PocketBridgeApi? _api;
  final RealBleClient _realBleClient = RealBleClient();
  PairingInfo? _pairing;
  IOWebSocketChannel? _eventChannel;
  StreamSubscription<dynamic>? _eventSubscription;
  bool _busy = false;
  int _selectedIndex = 0;
  String _status = 'Scan QR or fetch pairing from the Mac bridge URL.';
  PlatformFile? _selectedUploadFile;
  List<PocketItem> _items = [];
  List<PocketItem> _sharedItems = [];

  @override
  void initState() {
    super.initState();
    unawaited(_loadStoredPairing());
  }

  @override
  void dispose() {
    unawaited(_eventSubscription?.cancel());
    unawaited(_realBleClient.stopDemo());
    _eventChannel?.sink.close();
    _api?.close();
    _bridgeUrlController.dispose();
    _pairingPayloadController.dispose();
    _deviceNameController.dispose();
    _ideaController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final api = _api;
    final pairing = _pairing;

    final visibleSections = _sectionsForSelectedTab(api, pairing);

    return Scaffold(
      appBar: AppBar(
        title: const Text('PocketBridge'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: api == null || _busy ? null : _refreshAll,
            icon: const Icon(Icons.refresh),
          ),
          IconButton(
            tooltip: 'Forget pairing',
            onPressed: api == null || _busy ? null : _forgetPairing,
            icon: const Icon(Icons.link_off),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: visibleSections,
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedIndex,
        onDestinationSelected: (index) => setState(() => _selectedIndex = index),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.qr_code_2),
            label: 'Pairing',
          ),
          NavigationDestination(
            icon: Icon(Icons.edit_note),
            label: 'Capture',
          ),
          NavigationDestination(
            icon: Icon(Icons.send_to_mobile),
            label: 'Shared',
          ),
        ],
      ),
    );
  }

  List<Widget> _sectionsForSelectedTab(PocketBridgeApi? api, PairingInfo? pairing) {
    final sections = <Widget>[
      _StatusBanner(status: _status, busy: _busy),
      const SizedBox(height: 16),
    ];

    if (_selectedIndex == 0) {
      return [...sections, _pairingSection(pairing)];
    }
    if (_selectedIndex == 1) {
      return [
        ...sections,
        _captureSection(api),
        const SizedBox(height: 16),
        _inboxSection(),
      ];
    }
    return [...sections, _sharedSection()];
  }

  Widget _pairingSection(PairingInfo? pairing) {
    return _SectionCard(
      title: 'Pair with Mac',
      icon: Icons.qr_code_2,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _pairingPayloadController,
            minLines: 3,
            maxLines: 5,
            decoration: const InputDecoration(
              labelText: 'QR payload',
              hintText:
                  '{"protocol":"pocketbridge","serverBaseUrl":"...","pairCode":"..."}',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _busy ? null : _scanPairingQr,
            icon: const Icon(Icons.qr_code_scanner),
            label: const Text('Scan QR'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _bridgeUrlController,
            decoration: const InputDecoration(
              labelText: 'Mac bridge URL',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _deviceNameController,
            decoration: const InputDecoration(
              labelText: 'Device name',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: _busy ? null : _confirmPairing,
            icon: const Icon(Icons.link),
            label: const Text('Pair'),
          ),
          if (pairing != null) ...[
            const SizedBox(height: 10),
            Text(
              'Connected to ${pairing.deviceName} · ${pairing.serverBaseUrl}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ],
      ),
    );
  }

  Widget _captureSection(PocketBridgeApi? api) {
    return _SectionCard(
      title: 'Capture Idea',
      icon: Icons.edit_note,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _ideaController,
            minLines: 3,
            maxLines: 6,
            decoration: const InputDecoration(
              labelText: 'Inspiration text',
              hintText: 'Type an idea, note, link, or capture summary...',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: api == null || _busy ? null : _uploadIdea,
            icon: const Icon(Icons.upload_file),
            label: const Text('Upload text'),
          ),
          const Divider(height: 28),
          Row(
            children: [
              Expanded(
                child: Text(
                  _selectedUploadFile?.name ?? 'No file selected',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              OutlinedButton.icon(
                onPressed: _busy ? null : _pickUploadFile,
                icon: const Icon(Icons.attach_file),
                label: const Text('Choose'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: api == null || _busy || _selectedUploadFile == null
                ? null
                : _uploadSelectedFile,
            icon: const Icon(Icons.cloud_upload),
            label: const Text('Upload file'),
          ),
        ],
      ),
    );
  }

  Widget _inboxSection() {
    return _SectionCard(
      title: 'PocketInbox',
      icon: Icons.inbox,
      child: _items.isEmpty
          ? const _EmptyState(text: 'No inbox items loaded yet.')
          : Column(
              children: _items.map((item) => _PocketItemTile(item: item)).toList(),
            ),
    );
  }

  Widget _sharedSection() {
    return _SectionCard(
      title: 'Shared to Phone',
      icon: Icons.send_to_mobile,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _realBleControls(),
          const SizedBox(height: 12),
          if (_sharedItems.isEmpty)
            const _EmptyState(text: 'No shared phone items.')
          else
            ..._sharedItems.map(
              (item) => _PocketItemTile(
                item: item,
                trailing: Wrap(
                  spacing: 4,
                  children: [
                    IconButton(
                      tooltip: 'Copy download URL',
                      icon: const Icon(Icons.copy),
                      onPressed: item.downloadable
                          ? () => _copyDownloadUrl(item)
                          : null,
                    ),
                    IconButton(
                      tooltip: 'Download',
                      icon: const Icon(Icons.download),
                      onPressed: item.downloadable && !_busy
                          ? () => _downloadSharedItem(item)
                          : null,
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _realBleControls() {
    return Row(
      children: [
        Expanded(
          child: FilledButton.icon(
            onPressed: _busy ? null : _startRealBleDemo,
            icon: const Icon(Icons.bluetooth_connected),
            label: const Text('Start BLE Demo'),
          ),
        ),
        const SizedBox(width: 8),
        OutlinedButton.icon(
          onPressed: _busy ? null : _stopRealBleDemo,
          icon: const Icon(Icons.bluetooth_disabled),
          label: const Text('Stop BLE'),
        ),
      ],
    );
  }

  Future<void> _scanPairingQr() async {
    final payload = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const PairingScannerPage()),
    );
    if (payload == null || payload.trim().isEmpty) {
      return;
    }

    setState(() {
      _pairingPayloadController.text = payload.trim();
      _status = 'QR payload captured. Tap Pair.';
    });
  }

  Future<void> _confirmPairing() async {
    await _runBusy(() async {
      final pairing = await _readPairingInfo();
      await _applyPairing(pairing);
    });
  }

  Future<void> _loadStoredPairing() async {
    final prefs = await SharedPreferences.getInstance();
    final encoded = prefs.getString(_pairingPrefsKey);
    if (encoded == null || encoded.trim().isEmpty) {
      return;
    }

    PairingInfo pairing;
    try {
      pairing = PairingInfo.fromQrText(encoded);
    } on FormatException {
      await prefs.remove(_pairingPrefsKey);
      if (mounted) {
        setState(() => _status = 'Stored pairing was invalid. Pair again.');
      }
      return;
    }

    try {
      await _applyPairing(pairing, persist: false);
    } on Object catch (error) {
      if (mounted) {
        setState(() {
          _bridgeUrlController.text = pairing.serverBaseUrl;
          _pairingPayloadController.text = pairing.encode();
          _status = 'Stored pairing found, but Mac is unreachable: $error';
        });
      }
    }
  }

  Future<void> _applyPairing(PairingInfo pairing, {bool persist = true}) async {
    final api = PocketBridgeApi(pairing);
    await api.checkHealth();
    if (!mounted) {
      api.close();
      return;
    }

    await _eventSubscription?.cancel();
    _eventChannel?.sink.close();
    _api?.close();

    _api = api;
    _pairing = pairing;
    _bridgeUrlController.text = pairing.serverBaseUrl;
    _pairingPayloadController.text = pairing.encode();
    _status = 'Paired with ${pairing.serverBaseUrl}';
    _connectRealtime(api);
    if (persist) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_pairingPrefsKey, pairing.encode());
    }
    await _refreshAll();
  }

  Future<void> _forgetPairing() async {
    await _runBusy(() async {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_pairingPrefsKey);
      await _eventSubscription?.cancel();
      _eventChannel?.sink.close();
      _api?.close();
      _eventSubscription = null;
      _eventChannel = null;
      _api = null;
      _pairing = null;
      _items = [];
      _sharedItems = [];
      _pairingPayloadController.clear();
      _status = 'Pairing forgotten. Scan QR or fetch pairing again.';
    });
  }

  Future<PairingInfo> _readPairingInfo() async {
    final payload = _pairingPayloadController.text.trim();
    if (payload.startsWith('{')) {
      return PairingInfo.fromQrText(payload);
    }
    return PocketBridgeApi.fetchPairingFromServer(
      payload.isNotEmpty ? payload : _bridgeUrlController.text,
    );
  }

  void _connectRealtime(PocketBridgeApi api) {
    final channel = IOWebSocketChannel.connect(api.websocketUri());
    _eventChannel = channel;
    _eventSubscription = channel.stream.listen(
      _handleRealtimeEvent,
      onError: (Object error) {
        if (mounted) {
          setState(() => _status = 'Realtime disconnected: $error');
        }
      },
      onDone: () {
        if (mounted) {
          setState(() => _status = 'Realtime connection closed.');
        }
      },
    );
  }

  void _handleRealtimeEvent(Object? message) {
    try {
      final decoded = jsonDecode(String(message));
      if (decoded is! Map<String, dynamic>) {
        return;
      }
      final type = decoded['type'];
      if (type == 'item.created' ||
          type == 'item.updated' ||
          type == 'item.shared' ||
          type == 'knowledge.saved') {
        unawaited(_refreshAll());
      }
      if (type == 'ble.status' && mounted) {
        setState(() => _status = 'BLE status updated.');
      }
    } catch (_) {
      return;
    }
  }

  Future<void> _pickUploadFile() async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: false,
      type: FileType.any,
      withData: false,
    );
    final file = result?.files.single;
    if (file == null) {
      return;
    }

    setState(() {
      _selectedUploadFile = file;
      _status = 'Selected ${file.name}';
    });
  }

  Future<void> _uploadSelectedFile() async {
    final api = _api;
    final selected = _selectedUploadFile;
    if (api == null || selected == null) {
      return;
    }

    await _runBusy(() async {
      final item = await api.uploadFile(
        file: selected,
        sourceDevice: _sourceDeviceName,
      );
      _selectedUploadFile = null;
      _status = 'Uploaded "${item.title}"';
      await _refreshAll();
    });
  }

  Future<void> _uploadIdea() async {
    final api = _api;
    if (api == null) {
      return;
    }

    final text = _ideaController.text.trim();
    if (text.isEmpty) {
      setState(() => _status = 'Add text before uploading.');
      return;
    }

    await _runBusy(() async {
      final item = await api.uploadText(
        title: _titleFromText(text),
        text: text,
        sourceDevice: _sourceDeviceName,
      );
      _ideaController.clear();
      _status = 'Uploaded "${item.title}"';
      await _refreshAll();
    });
  }

  Future<void> _refreshAll() async {
    final api = _api;
    if (api == null) {
      return;
    }

    final items = await api.listItems();
    final sharedItems = await api.listSharedItems();
    if (!mounted) {
      return;
    }
    setState(() {
      _items = items;
      _sharedItems = sharedItems;
    });
  }

  Future<void> _copyDownloadUrl(PocketItem item) async {
    final api = _api;
    if (api == null || item.downloadUrl == null) {
      return;
    }

    final url = Uri.parse(api.pairing.serverBaseUrl).resolve(item.downloadUrl!).toString();
    await Clipboard.setData(ClipboardData(text: url));
    setState(() => _status = 'Copied download URL for ${item.title}');
  }

  Future<void> _downloadSharedItem(PocketItem item) async {
    final api = _api;
    if (api == null) {
      return;
    }

    await _runBusy(() async {
      final downloaded = await api.download(item);
      final directory = await getTemporaryDirectory();
      final file = File('${directory.path}/${_safeFilename(downloaded.filename)}');
      await file.writeAsBytes(downloaded.bytes, flush: true);
      _status = 'Downloaded ${downloaded.filename}';
      await OpenFilex.open(file.path);
    });
  }

  Future<void> _startRealBleDemo() async {
    await _runBusy(() async {
      final message = await _realBleClient.startDemo(deviceName: _sourceDeviceName);
      _status = message;
    });
  }

  Future<void> _stopRealBleDemo() async {
    await _runBusy(() async {
      final message = await _realBleClient.stopDemo();
      _status = message;
    });
  }

  Future<void> _runBusy(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } on PlatformException catch (error) {
      setState(() => _status = error.message ?? error.code);
    } on Object catch (error) {
      setState(() => _status = error.toString());
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  String get _sourceDeviceName {
    final value = _deviceNameController.text.trim();
    return value.isEmpty ? 'PocketBridge Phone' : value;
  }
}

class PairingScannerPage extends StatefulWidget {
  const PairingScannerPage({super.key});

  @override
  State<PairingScannerPage> createState() => _PairingScannerPageState();
}

class _PairingScannerPageState extends State<PairingScannerPage> {
  bool _handled = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scan Pairing QR')),
      body: MobileScanner(
        onDetect: (capture) {
          if (_handled) {
            return;
          }

          String? code;
          for (final barcode in capture.barcodes) {
            final rawValue = barcode.rawValue;
            if (rawValue != null && rawValue.trim().isNotEmpty) {
              code = rawValue;
              break;
            }
          }

          if (code == null) {
            return;
          }

          _handled = true;
          Navigator.of(context).pop(code);
        },
      ),
    );
  }
}

class _PocketItemTile extends StatelessWidget {
  const _PocketItemTile({required this.item, this.trailing});

  final PocketItem item;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final subtitleParts = [
      item.kind,
      item.origin,
      item.sourceDevice,
      _formatTimestamp(item.createdAt),
      if (item.text != null && item.text!.isNotEmpty) item.text!,
    ];

    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: CircleAvatar(
        child: Text(item.kind.isEmpty ? '?' : item.kind[0].toUpperCase()),
      ),
      title: Text(item.title),
      subtitle: Text(
        subtitleParts.join(' · '),
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: trailing,
    );
  }
}

class _StatusBanner extends StatelessWidget {
  const _StatusBanner({required this.status, required this.busy});

  final String status;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.primaryContainer,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          if (busy)
            const Padding(
              padding: EdgeInsets.only(right: 12),
              child: SizedBox.square(
                dimension: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          else
            const Padding(
              padding: EdgeInsets.only(right: 12),
              child: Icon(Icons.bridge),
            ),
          Expanded(child: Text(status)),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.title,
    required this.icon,
    required this.child,
  });

  final String title;
  final IconData icon;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        side: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon),
                const SizedBox(width: 10),
                Text(title, style: Theme.of(context).textTheme.titleMedium),
              ],
            ),
            const SizedBox(height: 16),
            child,
          ],
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 18),
      child: Center(
        child: Text(
          text,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
        ),
      ),
    );
  }
}

String _titleFromText(String text) {
  final trimmed = text.trim();
  if (trimmed.length <= 40) {
    return trimmed;
  }
  return '${trimmed.substring(0, 40)}...';
}

String _safeFilename(String filename) {
  return filename.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_');
}

String _formatTimestamp(DateTime value) {
  final local = value.toLocal();
  final month = local.month.toString().padLeft(2, '0');
  final day = local.day.toString().padLeft(2, '0');
  final hour = local.hour.toString().padLeft(2, '0');
  final minute = local.minute.toString().padLeft(2, '0');
  return '$month-$day $hour:$minute';
}
