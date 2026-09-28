import json
from datetime import datetime
import paho.mqtt.client as mqtt

import os

# Configuration (loads from config.json if available)
BROKER = "localhost"
PORT = 1883
TOPIC = "smartgarden/#"

if os.path.exists("config.json"):
    try:
        with open("config.json") as f:
            c = json.load(f)
            BROKER = c.get("mqtt", {}).get("host", BROKER)
            PORT = c.get("mqtt", {}).get("port", PORT)
            TOPIC = c.get("topics", {}).get("prefix", "smartgarden") + "/#"
    except Exception:
        pass


def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print("=" * 70)
        print(f"Connected to MQTT broker at {BROKER}:{PORT}")
        print(f"Subscribed to topic: '{TOPIC}'")
        print("=" * 70)
        print(f"{'TIME':<10} | {'TOPIC':<22} | {'READINGS'}")
        print("-" * 70)
        client.subscribe(TOPIC)
    else:
        print(f"Connection failed (code {rc})")


def on_message(client, userdata, msg):
    timestamp = datetime.now().strftime("%H:%M:%S")
    topic = msg.topic
    raw_payload = msg.payload.decode("utf-8", "ignore")

    try:
        data = json.loads(raw_payload)
        if "moisture" in data:
            details = f"Moisture: {data['moisture']:>4}%  |  Voltage: {data.get('voltage', 0):.2f}V  |  Raw: {data.get('raw', 0)}"
        elif "light" in data or "brightness" in data:
            details = f"Light: {data.get('light', data.get('brightness'))}"
        else:
            details = str(data)
    except Exception:
        details = raw_payload

    print(f"{timestamp:<10} | {topic:<22} | {details}")


def main():
    try:
        # Compatible with paho-mqtt v2.x and v1.x
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    except AttributeError:
        client = mqtt.Client()

    client.on_connect = on_connect
    client.on_message = on_message

    print(f"Connecting to {BROKER}:{PORT}...")
    try:
        client.connect(BROKER, PORT, keepalive=60)
        client.loop_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    except Exception as e:
        print(f"Connection error: {e}")


if __name__ == "__main__":
    main()
