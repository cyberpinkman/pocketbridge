package app.pocketbridge.mobile

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.ParcelUuid
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.android.FlutterActivity
import io.flutter.plugin.common.MethodChannel
import java.nio.charset.StandardCharsets
import java.util.UUID

class MainActivity : FlutterActivity() {
    companion object {
        private const val TAG = "PocketBridgeBLE"
        private const val REQUEST_BLE_PERMISSIONS = 4002
        private const val REQUEST_LEGACY_BLE_PERMISSIONS = 4001
    }

    private val channelName = "pocketbridge/ble"
    private val transferServiceUuid = UUID.fromString("6f8f8e11-07bb-4f0c-b9a9-54f5af7d9c31")
    private val downlinkNotifyUuid = UUID.fromString("6f8f8e12-07bb-4f0c-b9a9-54f5af7d9c31")
    private val uplinkWriteUuid = UUID.fromString("6f8f8e13-07bb-4f0c-b9a9-54f5af7d9c31")
    private val pocketKeyServiceUuid = UUID.fromString("6f8f8e21-07bb-4f0c-b9a9-54f5af7d9c31")
    private val clientConfigDescriptorUuid = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

    private var scanner: BluetoothLeScanner? = null
    private var advertiser: BluetoothLeAdvertiser? = null
    private var gatt: BluetoothGatt? = null
    private var uplink: BluetoothGattCharacteristic? = null
    private var pendingBleDemoDeviceName: String? = null
    private var bleDemoRunning = false

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName).setMethodCallHandler { call, result ->
            when (call.method) {
                "startDemo" -> {
                    val deviceName = call.argument<String>("deviceName") ?: "PocketBridge Phone"
                    if (ensureBlePermissions(deviceName)) {
                        startBleDemo(deviceName)
                        result.success("Real BLE demo started")
                    } else {
                        result.success("BLE permissions requested; demo will start after approval")
                    }
                }
                "stopDemo" -> {
                    stopBleDemo()
                    result.success("Real BLE demo stopped")
                }
                else -> result.notImplemented()
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun startBleDemo(deviceName: String) {
        if (bleDemoRunning) {
            Log.i(TAG, "Real BLE demo already running")
            return
        }
        val adapter = bluetoothAdapter() ?: return
        scanner = adapter.bluetoothLeScanner
        advertiser = adapter.bluetoothLeAdvertiser
        bleDemoRunning = true
        startPocketKeyAdvertising(deviceName)
        scanForTransferService()
    }

    @SuppressLint("MissingPermission")
    private fun stopBleDemo() {
        scanner?.stopScan(scanCallback)
        advertiser?.stopAdvertising(advertiseCallback)
        gatt?.disconnect()
        gatt?.close()
        gatt = null
        uplink = null
        pendingBleDemoDeviceName = null
        bleDemoRunning = false
        Log.i(TAG, "Real BLE demo stopped")
    }

    @SuppressLint("MissingPermission")
    private fun scanForTransferService() {
        val filter = ScanFilter.Builder()
            .setServiceUuid(ParcelUuid(transferServiceUuid))
            .build()
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()
        try {
            scanner?.startScan(listOf(filter), settings, scanCallback)
            Log.i(TAG, "Scanning for PocketBridgeTransferService")
        } catch (error: SecurityException) {
            Log.e(TAG, "Missing BLE scan permission", error)
        }
    }

    private val scanCallback = object : ScanCallback() {
        @SuppressLint("MissingPermission")
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            scanner?.stopScan(this)
            Log.i(TAG, "Found PocketBridgeTransferService, connecting to ${result.device.address}")
            gatt = result.device.connectGatt(this@MainActivity, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
        }

        override fun onScanFailed(errorCode: Int) {
            Log.e(TAG, "BLE scan failed with code $errorCode")
        }
    }

    private val gattCallback = object : BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (newState == BluetoothGatt.STATE_CONNECTED) {
                Log.i(TAG, "Connected to PocketBridgeTransferService")
                gatt.discoverServices()
            }
        }

        @SuppressLint("MissingPermission")
        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            val service: BluetoothGattService = gatt.getService(transferServiceUuid) ?: return
            val downlink = service.getCharacteristic(downlinkNotifyUuid) ?: return
            uplink = service.getCharacteristic(uplinkWriteUuid)
            gatt.setCharacteristicNotification(downlink, true)
            val descriptor: BluetoothGattDescriptor? = downlink.getDescriptor(clientConfigDescriptorUuid)
            descriptor?.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
            descriptor?.let { gatt.writeDescriptor(it) }
            Log.i(TAG, "Subscribed to PocketBridge downlink notifications")
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray
        ) {
            if (characteristic.uuid == downlinkNotifyUuid) {
                Log.i(TAG, "Received BLE downlink frame: ${value.size} bytes")
                writeAck(gatt, value.size)
            }
        }

        @Deprecated("Deprecated in Java")
        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            if (characteristic.uuid == downlinkNotifyUuid) {
                Log.i(TAG, "Received BLE downlink frame: ${characteristic.value?.size ?: 0} bytes")
                writeAck(gatt, characteristic.value?.size ?: 0)
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun writeAck(gatt: BluetoothGatt, bytes: Int) {
        val characteristic = uplink ?: return
        val ack = """{"type":"ack","bytes":$bytes}""".toByteArray(StandardCharsets.UTF_8)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            gatt.writeCharacteristic(characteristic, ack, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT)
        } else {
            characteristic.value = ack
            characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
            gatt.writeCharacteristic(characteristic)
        }
    }

    @SuppressLint("MissingPermission")
    private fun startPocketKeyAdvertising(deviceName: String) {
        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .setConnectable(false)
            .build()
        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .addServiceUuid(ParcelUuid(pocketKeyServiceUuid))
            .build()
        try {
            advertiser?.startAdvertising(settings, data, advertiseCallback)
            Log.i(TAG, "Starting PocketKeyService advertising for $deviceName")
        } catch (error: SecurityException) {
            Log.e(TAG, "Missing BLE advertise permission", error)
        }
    }

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
            Log.i(TAG, "PocketKeyService advertising started")
        }

        override fun onStartFailure(errorCode: Int) {
            Log.e(TAG, "PocketKeyService advertising failed with code $errorCode")
        }
    }

    private fun bluetoothAdapter(): BluetoothAdapter? {
        val manager = getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        return manager.adapter
    }

    private fun ensureBlePermissions(deviceName: String): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return requestIfMissing(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION), REQUEST_LEGACY_BLE_PERMISSIONS, deviceName)
        }
        return requestIfMissing(
            arrayOf(
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_ADVERTISE
            ),
            REQUEST_BLE_PERMISSIONS,
            deviceName
        )
    }

    private fun requestIfMissing(permissions: Array<String>, requestCode: Int, deviceName: String): Boolean {
        val missing = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) {
            pendingBleDemoDeviceName = deviceName
            ActivityCompat.requestPermissions(this, missing.toTypedArray(), requestCode)
            return false
        }
        return true
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQUEST_BLE_PERMISSIONS && requestCode != REQUEST_LEGACY_BLE_PERMISSIONS) {
            return
        }
        val deviceName = pendingBleDemoDeviceName ?: return
        pendingBleDemoDeviceName = null
        if (grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }) {
            startBleDemo(deviceName)
        } else {
            Log.e(TAG, "BLE permissions denied")
        }
    }
}
