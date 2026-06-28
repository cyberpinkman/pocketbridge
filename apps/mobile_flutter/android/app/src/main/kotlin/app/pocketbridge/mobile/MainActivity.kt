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
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.android.FlutterActivity
import io.flutter.plugin.common.MethodChannel
import java.nio.charset.StandardCharsets
import java.util.UUID

class MainActivity : FlutterActivity() {
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

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName).setMethodCallHandler { call, result ->
            when (call.method) {
                "startDemo" -> {
                    ensureBlePermissions()
                    startBleDemo(call.argument<String>("deviceName") ?: "PocketBridge Phone")
                    result.success("Real BLE demo started")
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
        val adapter = bluetoothAdapter() ?: return
        scanner = adapter.bluetoothLeScanner
        advertiser = adapter.bluetoothLeAdvertiser
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
    }

    @SuppressLint("MissingPermission")
    private fun scanForTransferService() {
        val filter = ScanFilter.Builder()
            .setServiceUuid(ParcelUuid(transferServiceUuid))
            .build()
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()
        scanner?.startScan(listOf(filter), settings, scanCallback)
    }

    private val scanCallback = object : ScanCallback() {
        @SuppressLint("MissingPermission")
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            scanner?.stopScan(this)
            gatt = result.device.connectGatt(this@MainActivity, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
        }
    }

    private val gattCallback = object : BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (newState == BluetoothGatt.STATE_CONNECTED) {
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
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray
        ) {
            if (characteristic.uuid == downlinkNotifyUuid) {
                writeAck(gatt, value.size)
            }
        }

        @Deprecated("Deprecated in Java")
        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            if (characteristic.uuid == downlinkNotifyUuid) {
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
            .addServiceData(ParcelUuid(pocketKeyServiceUuid), deviceName.toByteArray(StandardCharsets.UTF_8))
            .build()
        advertiser?.startAdvertising(settings, data, advertiseCallback)
    }

    private val advertiseCallback = object : AdvertiseCallback() {}

    private fun bluetoothAdapter(): BluetoothAdapter? {
        val manager = getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        return manager.adapter
    }

    private fun ensureBlePermissions() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            requestIfMissing(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION), 4001)
            return
        }
        requestIfMissing(
            arrayOf(
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_ADVERTISE
            ),
            4002
        )
    }

    private fun requestIfMissing(permissions: Array<String>, requestCode: Int) {
        val missing = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toTypedArray(), requestCode)
        }
    }
}
