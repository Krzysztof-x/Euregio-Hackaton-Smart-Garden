#!/usr/bin/env python3
"""
smart_garden_mqtt.py - Reads the DHT11 and the light sensor and sends the
values to the MQTT broker every few seconds.

Needs:  paho-mqtt + adafruit-circuitpython-dht (see README)
Run:    python3 smart_garden_mqtt.py      (Ctrl+C to stop)
"""

import os
import json
import time
import adafruit_dht
import board
import paho.mqtt.publish as publish
from gpiozero import DigitalInputDevice

# ---- Load settings from shared config.json (with fallback) ----
config_path = "config.json" if os.path.exists("config.json") else "../config.json"
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
SEND_INTERVAL_S = rpi_cfg.get("interval_s", 10)

TOPIC_TEMPERATURE = topics_cfg.get("temperature", "smartgarden/temperature")
TOPIC_HUMIDITY = topics_cfg.get("humidity", "smartgarden/humidity")
TOPIC_LIGHT = topics_cfg.get("light", "smartgarden/light")

# DHT11 data wire on GPIO4 (pin 7)
dht_device = adafruit_dht.DHT11(board.D4)

# Light sensor DO on GPIO17 (pin 11): value 1 = DARK, 0 = LIGHT
light_sensor = DigitalInputDevice(17, pull_up=None, active_state=True)


def read_dht11():
    """Return (temperature, humidity), or None if the read failed."""
    try:
        temperature = dht_device.temperature
        humidity = dht_device.humidity
    except RuntimeError as error:
        # the DHT11 drops a read now and then - show why and try again next round
        print(time.strftime("%H:%M:%S"), "DHT11 read failed:", error)
        return None
    if temperature is None or humidity is None:
        print(time.strftime("%H:%M:%S"), "DHT11 returned no value")
        return None
    return temperature, humidity


# Login data for the broker (None = no login)
auth = {"username": USERNAME, "password": PASSWORD} if USERNAME else None

print(
    f"Sending to {BROKER_HOST}:{BROKER_PORT} every {SEND_INTERVAL_S} s (Ctrl+C to stop)")

try:
    while True:
        messages = []  # list of (topic, value) to send this round

        light = "DARK" if light_sensor.value == 1 else "LIGHT"
        messages.append((TOPIC_LIGHT, light))

        reading = read_dht11()
        if reading is not None:
            temperature, humidity = reading
            messages.append((TOPIC_TEMPERATURE, temperature))
            messages.append((TOPIC_HUMIDITY, humidity))

        try:
            # Connect to the broker, send all messages, disconnect again
            publish.multiple(messages, hostname=BROKER_HOST,
                             port=BROKER_PORT, auth=auth)
            print(time.strftime("%H:%M:%S"), "sent:", messages)
        except Exception as error:
            # Broker not reachable, wrong login, ... -> show it and try again next round
            print(time.strftime("%H:%M:%S"),
                  "could not send to the broker:", error)

        time.sleep(SEND_INTERVAL_S)
except KeyboardInterrupt:
    print("\nStopped.")
finally:
    dht_device.exit()  # release GPIO4, otherwise the next program can't use the DHT11
