#!/usr/bin/env python3
"""
smart_garden_mqtt.py - Smart Garden Controller for Raspberry Pi
- Reads DHT11 (Temperature & Humidity)
- Subscribes to MQTT for ESP32 sensors (Soil Moisture & Light)
- Publishes DHT11 readings to MQTT
- Displays all 4 live sensor readings on the Grove RGB LCD (JHD1313M3)
"""

import os
import json
import time
import board
import adafruit_dht
import paho.mqtt.client as mqtt

# ==============================================================================
# 1. LOAD CONFIGURATION
# ==============================================================================
config_path = "config.json" if os.path.exists(
    "config.json") else "../config.json"
cfg = {}
if os.path.exists(config_path):
    try:
        with open(config_path) as f:
            cfg = json.load(f)
    except Exception:
        pass

mqtt_cfg = cfg.get("mqtt", {})
topics_cfg = cfg.get("topics", {})
rpi_cfg = cfg.get("rpi", {})

BROKER_HOST = mqtt_cfg.get("host", "192.168.1.207")
BROKER_PORT = mqtt_cfg.get("port", 1883)
USERNAME = mqtt_cfg.get("username")
PASSWORD = mqtt_cfg.get("password")
SEND_INTERVAL_S = rpi_cfg.get("interval_s", 5)

TOPIC_TEMPERATURE = topics_cfg.get("temperature", "smartgarden/temperature")
TOPIC_HUMIDITY = topics_cfg.get("humidity", "smartgarden/humidity")
TOPIC_MOISTURE = topics_cfg.get("moisture", "smartgarden/moisture")
TOPIC_LIGHT = topics_cfg.get("light", "smartgarden/light")

# ==============================================================================
# 2. HARDWARE SETUP (DHT11 & GROVE RGB LCD)
# ==============================================================================
# DHT11 setup (configurable in config.json under rpi.dht_pin, default 4)
DHT_PIN_NUM = rpi_cfg.get("dht_pin", 4)
dht_pin_attr = f"D{DHT_PIN_NUM}"
dht_pin = getattr(board, dht_pin_attr, board.D4)

dht_device = None
try:
    dht_device = adafruit_dht.DHT11(dht_pin)
    print(f"[DHT11] Initialized on GPIO {DHT_PIN_NUM}")
except Exception as e:
    print(f"[DHT11] Warning: Could not initialize on GPIO {DHT_PIN_NUM}: {e}")
    print("[DHT11] (Hint: If GPIO 4 is used, ensure 1-Wire overlay is disabled or try GPIO 17)")

# Grove LCD on Hardware I2C (SDA=Pin 3, SCL=Pin 5)
LCD_ADDR = 0x3E
RGB_ADDR = 0x62
lcd_available = False

try:
    i2c = board.I2C()
    while not i2c.try_lock():
        pass
    devices = i2c.scan()
    i2c.unlock()

    if LCD_ADDR in devices:
        lcd_available = True
        if 0x62 in devices:
            RGB_ADDR = 0x62
        elif 0x30 in devices:
            RGB_ADDR = 0x30
        elif 0x60 in devices:
            RGB_ADDR = 0x60
        print(
            f"[LCD] Grove RGB LCD initialized (LCD={hex(LCD_ADDR)}, RGB={hex(RGB_ADDR)})")
    else:
        print("[LCD] LCD not detected on I2C, running in headless mode.")
except Exception as e:
    print(f"[LCD] Could not initialize I2C: {e}")


def set_rgb(r, g, b):
    if not lcd_available:
        return
    while not i2c.try_lock():
        pass
    try:
        if RGB_ADDR == 0x62:
            i2c.writeto(RGB_ADDR, bytes([0x00, 0x00]))
            i2c.writeto(RGB_ADDR, bytes([0x01, 0x00]))
            i2c.writeto(RGB_ADDR, bytes([0x08, 0xAA]))
            i2c.writeto(RGB_ADDR, bytes([0x04, r]))
            i2c.writeto(RGB_ADDR, bytes([0x03, g]))
            i2c.writeto(RGB_ADDR, bytes([0x02, b]))
        else:
            i2c.writeto(RGB_ADDR, bytes([0x00, 0x00]))
            i2c.writeto(RGB_ADDR, bytes([0x01, 0x05]))
            i2c.writeto(RGB_ADDR, bytes([0x02, b]))
            i2c.writeto(RGB_ADDR, bytes([0x03, g]))
            i2c.writeto(RGB_ADDR, bytes([0x04, r]))
    except Exception:
        pass
    finally:
        i2c.unlock()


def lcd_cmd(cmd):
    if not lcd_available:
        return
    while not i2c.try_lock():
        pass
    try:
        i2c.writeto(LCD_ADDR, bytes([0x80, cmd]))
    finally:
        i2c.unlock()


def lcd_data(data):
    if not lcd_available:
        return
    while not i2c.try_lock():
        pass
    try:
        i2c.writeto(LCD_ADDR, bytes([0x40, data]))
    finally:
        i2c.unlock()


def init_lcd():
    if not lcd_available:
        return
    time.sleep(0.05)
    lcd_cmd(0x28)
    time.sleep(0.005)
    lcd_cmd(0x0C)
    time.sleep(0.005)
    lcd_cmd(0x01)
    time.sleep(0.01)
    set_rgb(0, 255, 100)


def show_lcd(line1, line2=""):
    if not lcd_available:
        return
    lcd_cmd(0x01)
    time.sleep(0.005)
    for c in line1[:16]:
        lcd_data(ord(c))
    if line2:
        lcd_cmd(0xC0)
        time.sleep(0.001)
        for c in line2[:16]:
            lcd_data(ord(c))


# ==============================================================================
# 3. LIVE STATE & DISPLAY REFRESH
# ==============================================================================
live_data = {
    "temperature": None,
    "humidity": None,
    "moisture": None,
    "light": None,
}


def update_display():
    """Formats all 4 sensor values and updates LCD text + RGB color."""
    t = f"{live_data['temperature']}C" if live_data["temperature"] is not None else "--C"
    h = f"{live_data['humidity']}%" if live_data["humidity"] is not None else "--%"
    m = f"{live_data['moisture']}%" if live_data["moisture"] is not None else "--%"
    l = f"{live_data['light']}%" if live_data["light"] is not None else "--%"

    line1 = f"T:{t:<5}  H:{h:<4}"
    line2 = f"Soil:{m:<4} L:{l:<4}"
    show_lcd(line1, line2)

    # Dynamic RGB Color Status:
    # Red: Soil dry (< 25%) -> Needs water!
    # Green: Healthy garden state
    # Blue: Humid (> 70%)
    if live_data["moisture"] is not None and live_data["moisture"] < 25:
        set_rgb(255, 0, 0)  # Red warning
    elif live_data["humidity"] is not None and live_data["humidity"] > 70:
        set_rgb(0, 100, 255)  # Blue humid
    else:
        set_rgb(0, 255, 50)  # Healthy green


# ==============================================================================
# 4. MQTT CLIENT (PUBLISH & SUBSCRIBE)
# ==============================================================================
def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print(f"[MQTT] Connected to {BROKER_HOST}:{BROKER_PORT}")
        # Subscribe to ESP32 topics
        client.subscribe("smartgarden/#")
        print("[MQTT] Subscribed to 'smartgarden/#'")
    else:
        print(f"[MQTT] Connection failed (code {rc})")


def on_message(client, userdata, msg):
    payload = msg.payload.decode("utf-8", "ignore")
    try:
        # ESP32 Soil Moisture
        if msg.topic == TOPIC_MOISTURE:
            data = json.loads(payload)
            live_data["moisture"] = data.get("moisture")
            update_display()

        # ESP32 Light Sensor
        elif msg.topic == TOPIC_LIGHT:
            data = json.loads(payload)
            live_data["light"] = data.get("percent", data.get("light"))
            update_display()
    except Exception as e:
        print(f"[MQTT] Parse error: {e}")


def read_dht11():
    global dht_device
    if dht_device is None:
        try:
            dht_device = adafruit_dht.DHT11(dht_pin)
        except Exception:
            return None
    try:
        t = dht_device.temperature
        h = dht_device.humidity
        if t is not None and h is not None:
            return t, h
        return None
    except RuntimeError:
        # Transient read error typical of DHT sensors
        return None
    except Exception as e:
        print(f"[DHT11] Unexpected error: {e}")
        return None


# ==============================================================================
# 5. MAIN LOOP
# ==============================================================================
def main():
    init_lcd()
    show_lcd("Smart Garden", "Connecting...")

    try:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    except AttributeError:
        client = mqtt.Client()

    if USERNAME:
        client.username_pw_set(USERNAME, PASSWORD)

    client.on_connect = on_connect
    client.on_message = on_message

    print(f"Connecting to broker at {BROKER_HOST}:{BROKER_PORT}...")
    try:
        client.connect(BROKER_HOST, BROKER_PORT, keepalive=60)
        client.loop_start()  # Runs MQTT subscribe loop in background thread
    except Exception as e:
        print(f"[MQTT] Connect error: {e}")

    show_lcd("Smart Garden", "Ready!")
    time.sleep(2)

    try:
        while True:
            # 1. Read DHT11 from Pi
            reading = read_dht11()
            if reading is not None:
                temp, hum = reading
                live_data["temperature"] = temp
                live_data["humidity"] = hum

                # Publish DHT11 readings to MQTT
                client.publish(TOPIC_TEMPERATURE, str(temp))
                client.publish(TOPIC_HUMIDITY, str(hum))
                print(f"[DHT11] Temp: {temp}°C | Humidity: {hum}% -> Published")

                update_display()
            else:
                print(f"[DHT11] Read failed or pin busy on GPIO {DHT_PIN_NUM}. Retrying in {SEND_INTERVAL_S}s...")

            time.sleep(SEND_INTERVAL_S)

    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        client.loop_stop()
        client.disconnect()
        if dht_device is not None:
            try:
                dht_device.exit()
            except Exception:
                pass
        set_rgb(0, 0, 0)
        show_lcd("", "")


if __name__ == "__main__":
    main()
