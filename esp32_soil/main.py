from umqtt.simple import MQTTClient  # noqa: I001
import json
import time
import network
from machine import ADC, Pin

# Configuration (loaded from config.json if available)
CONFIG = {
    "wifi": {"ssid": "ASUS_group4", "password": "Group4!!"},
    "mqtt": {"host": "192.168.1.207", "port": 1883, "username": None, "password": None},
    "topics": {
        "moisture": "smartgarden/moisture",
        "light": "smartgarden/light"
    },
    "esp32": {
        "client_id": "esp32-garden-sensors",
        "soil_pin": 34,
        "light_pin": 35,
        "dry_value": 52700,
        "wet_value": 22000,
        "v_ref": 3.3,
        "interval_s": 5
    }
}

try:
    with open("config.json") as f:
        cfg = json.load(f)
        for k in ("wifi", "mqtt", "topics", "esp32"):
            if k in cfg:
                CONFIG[k].update(cfg[k])
except Exception:
    pass

WIFI_SSID = CONFIG["wifi"]["ssid"]
WIFI_PASSWORD = CONFIG["wifi"]["password"]
MQTT_BROKER = CONFIG["mqtt"]["host"]
MQTT_PORT = CONFIG["mqtt"]["port"]
MQTT_USER = CONFIG["mqtt"].get("username")
MQTT_PASS = CONFIG["mqtt"].get("password")
TOPIC_MOISTURE = CONFIG["topics"]["moisture"]
TOPIC_LIGHT = CONFIG["topics"]["light"]
CLIENT_ID = CONFIG["esp32"]["client_id"]
INTERVAL = CONFIG["esp32"]["interval_s"]

SOIL_PIN = CONFIG["esp32"].get("soil_pin", CONFIG["esp32"].get("sensor_pin", 34))
LIGHT_PIN = CONFIG["esp32"].get("light_pin", 35)
DRY_VALUE = CONFIG["esp32"]["dry_value"]
WET_VALUE = CONFIG["esp32"]["wet_value"]
V_REF = CONFIG["esp32"]["v_ref"]


# SENSOR LOGIC (Both on ADC1 pins -> safe to use with WiFi)
adc_soil = ADC(Pin(SOIL_PIN))
adc_soil.atten(ADC.ATTN_11DB)

adc_light = ADC(Pin(LIGHT_PIN))
adc_light.atten(ADC.ATTN_11DB)


def read_soil(samples=10):
    raw = sum(adc_soil.read_u16() for _ in range(samples)) // samples
    voltage = round((raw / 65535.0) * V_REF, 2)
    diff = DRY_VALUE - WET_VALUE
    moisture = max(0.0, min(100.0, (DRY_VALUE - raw) / diff * 100.0)) if diff else 0.0
    return {
        "raw": raw,
        "voltage": voltage,
        "moisture": round(moisture, 1)
    }


def read_light(samples=10):
    raw = sum(adc_light.read_u16() for _ in range(samples)) // samples
    voltage = round((raw / 65535.0) * V_REF, 2)
    # LDR AO: More light -> lower resistance -> lower voltage
    # Inverted mapping: 0% = pitch dark, 100% = max bright
    percent = max(0.0, min(100.0, (65535 - raw) / 65535.0 * 100.0))
    return {
        "raw": raw,
        "voltage": voltage,
        "percent": round(percent, 1)
    }


# WIFI
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


# MAIN LOOP
def main():
    connect_wifi()

    print(f"Connecting to MQTT Broker at {MQTT_BROKER}:{MQTT_PORT}...")
    client = MQTTClient(CLIENT_ID, MQTT_BROKER, port=MQTT_PORT,
                        user=MQTT_USER, password=MQTT_PASS)
    client.connect()
    print("MQTT OK! Streaming soil moisture & light data...\n")

    while True:
        try:
            # Soil moisture reading
            soil_data = read_soil()
            client.publish(TOPIC_MOISTURE, json.dumps(soil_data))
            print(f"[{TOPIC_MOISTURE}] {soil_data}")

            # Analog light reading
            light_data = read_light()
            client.publish(TOPIC_LIGHT, json.dumps(light_data))
            print(f"[{TOPIC_LIGHT}] {light_data}")

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
