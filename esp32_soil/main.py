from umqtt.simple import MQTTClient  # noqa: I001
import json
import time
import network
from machine import ADC, Pin

# ==============================================================================
# CONFIGURATION
# ==============================================================================
WIFI_SSID = "ASUS_group4"
WIFI_PASSWORD = "Group4!!"

MQTT_BROKER = "192.168.1.207"
MQTT_PORT = 1883
MQTT_TOPIC = "smartgarden/moisture"
CLIENT_ID = "esp32-soil-moisture"
INTERVAL = 5  # publish interval in seconds

# Sensor calibration (Pin 34 is on ADC1, safe to use with WiFi)
SENSOR_PIN = 34
DRY_VALUE = 52700
WET_VALUE = 22000
V_REF = 3.3


# ==============================================================================
# SENSOR LOGIC
# ==============================================================================
adc = ADC(Pin(SENSOR_PIN))
adc.atten(ADC.ATTN_11DB)


def read_sensor(samples=10):
    raw = sum(adc.read_u16() for _ in range(samples)) // samples
    voltage = round((raw / 65535.0) * V_REF, 2)
    diff = DRY_VALUE - WET_VALUE
    moisture = max(0.0, min(100.0, (DRY_VALUE - raw) /
                   diff * 100.0)) if diff else 0.0
    return {
        "raw": raw,
        "voltage": voltage,
        "moisture": round(moisture, 1)
    }


# ==============================================================================
# WIFI
# ==============================================================================
def connect_wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    if not wlan.isconnected():
        print(f"Connecting to WiFi '{WIFI_SSID}'...")
        wlan.connect(WIFI_SSID, WIFI_PASSWORD)
        start = time.time()
        while not wlan.isconnected():
            if time.time() - start > 15:
                raise RuntimeError("WiFi connection timeout!")
            time.sleep(0.5)
    ip, _, gw, _ = wlan.ifconfig()
    print(f"WiFi OK: IP={ip} | Gateway={gw}")
    return wlan


# ==============================================================================
# MAIN LOOP
# ==============================================================================
def main():
    connect_wifi()

    print(f"Connecting to MQTT Broker at {MQTT_BROKER}:{MQTT_PORT}...")
    client = MQTTClient(CLIENT_ID, MQTT_BROKER, port=MQTT_PORT)
    client.connect()
    print("MQTT OK! Streaming sensor data...\n")

    while True:
        try:
            data = read_sensor()
            payload = json.dumps(data)
            client.publish(MQTT_TOPIC, payload)
            print(f"[{MQTT_TOPIC}] {payload}")
            time.sleep(INTERVAL)
        except KeyboardInterrupt:
            print("\nExiting...")
            client.disconnect()
            break
        except Exception as e:
            print(f"Error ({e}), reconnecting in 3s...")
            time.sleep(3)
            try:
                connect_wifi()
                client.connect()
            except Exception:
                pass


if __name__ == "__main__":
    main()
