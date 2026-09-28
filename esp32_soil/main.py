import json
import socket
import time

import network
from machine import ADC, Pin

# Configuration
WIFI_SSID = "ASUS_group4"
WIFI_PASSWORD = "Group4!!"
SENSOR_PIN = 34
SERVER_PORT = 80

DRY_VALUE = 52700
WET_VALUE = 22000
V_REF = 3.3


class SoilMoistureSensor:
    def __init__(self, pin_num: int, dry_val: int = DRY_VALUE, wet_val: int = WET_VALUE, v_ref: float = V_REF):
        self.dry_val = dry_val
        self.wet_val = wet_val
        self.v_ref = v_ref
        self.adc = ADC(Pin(pin_num))
        if hasattr(self.adc, "atten"):
            try:
                self.adc.atten(ADC.ATTN_11DB)
            except Exception:
                pass

    def read_raw(self, samples: int = 10) -> int:
        total = 0
        for _ in range(samples):
            total += self.adc.read_u16()
            time.sleep_ms(5)
        return total // samples

    def read_voltage(self, samples: int = 10) -> float:
        return (self.read_raw(samples) / 65535.0) * self.v_ref

    def read_percentage(self, samples: int = 10) -> float:
        if self.dry_val == self.wet_val:
            return 0.0
        raw = self.read_raw(samples)
        percent = (self.dry_val - raw) / (self.dry_val - self.wet_val) * 100.0
        return max(0.0, min(100.0, percent))


def connect_wifi(ssid: str, password: str, timeout: int = 15) -> str:
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)

    if not wlan.isconnected():
        print(f"Connecting to WiFi '{ssid}'...")
        wlan.connect(ssid, password)
        start = time.time()
        while not wlan.isconnected():
            if time.time() - start > timeout:
                raise RuntimeError("WiFi connection timed out")
            time.sleep(0.5)

    ip = wlan.ifconfig()[0]
    print(f"Connected! IP: {ip}")
    return ip


def start_server(sensor: SoilMoistureSensor, port: int = 80):
    addr = socket.getaddrinfo("0.0.0.0", port)[0][-1]
    server_socket = socket.socket()
    server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server_socket.bind(addr)
    server_socket.listen(2)
    print(f"API server listening on port {port}")

    while True:
        client = None
        try:
            client, _ = server_socket.accept()
            _ = client.recv(1024)

            payload = json.dumps({
                "raw": sensor.read_raw(),
                "voltage": round(sensor.read_voltage(), 2),
                "moisture": round(sensor.read_percentage(), 1)
            })

            res = (
                "HTTP/1.1 200 OK\r\n"
                "Content-Type: application/json\r\n"
                "Access-Control-Allow-Origin: *\r\n"
                f"Content-Length: {len(payload)}\r\n\r\n"
                f"{payload}"
            )
            client.sendall(res.encode("utf-8"))
        except Exception as e:
            print("Request error:", e)
        finally:
            if client:
                client.close()


def main():
    sensor = SoilMoistureSensor(pin_num=SENSOR_PIN)
    ip = connect_wifi(WIFI_SSID, WIFI_PASSWORD)
    print(f"API endpoint: http://{ip}/ (or /api/moisture)")
    start_server(sensor, port=SERVER_PORT)


if __name__ == "__main__":
    main()
