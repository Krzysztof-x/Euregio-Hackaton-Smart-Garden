#!/usr/bin/env python3
"""
test_lcd.py - Test Grove LCD RGB Backlight (JHD1313M3) on Raspberry Pi
Pins:
  SDA = GPIO 14 (Physical Pin 8)
  SCL = GPIO 15 (Physical Pin 10)
  VCC = 5V      (Physical Pin 2)
  GND = GND     (Physical Pin 6)
"""

import time
import sys

LCD_ADDR = 0x3E
RGB_ADDR = 0x62

# Try Adafruit bitbangio first, fall back to pure RPi.GPIO bitbang
i2c = None

try:
    import adafruit_bitbangio as bitbangio
    import board
    i2c_dev = bitbangio.I2C(scl=board.D15, sda=board.D14)

    class AdafruitAdapter:
        def __init__(self, dev):
            self.dev = dev

        def scan(self):
            while not self.dev.try_lock():
                pass
            found = self.dev.scan()
            self.dev.unlock()
            return found

        def writeto(self, addr, buf):
            while not self.dev.try_lock():
                pass
            try:
                self.dev.writeto(addr, bytes(buf))
            finally:
                self.dev.unlock()

    i2c = AdafruitAdapter(i2c_dev)
    print("Using adafruit_bitbangio driver.")
except Exception:
    pass

if i2c is None:
    # Pure Python Software I2C using RPi.GPIO
    try:
        import RPi.GPIO as GPIO
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)

        class SoftI2C:
            def __init__(self, sda=14, scl=15):
                self.sda = sda
                self.scl = scl
                GPIO.setup(self.scl, GPIO.OUT, initial=GPIO.HIGH)
                GPIO.setup(self.sda, GPIO.OUT, initial=GPIO.HIGH)

            def _delay(self):
                time.sleep(0.00001)  # ~50 kHz

            def _start(self):
                GPIO.setup(self.sda, GPIO.OUT)
                GPIO.output(self.sda, GPIO.HIGH)
                GPIO.output(self.scl, GPIO.HIGH)
                self._delay()
                GPIO.output(self.sda, GPIO.LOW)
                self._delay()
                GPIO.output(self.scl, GPIO.LOW)
                self._delay()

            def _stop(self):
                GPIO.setup(self.sda, GPIO.OUT)
                GPIO.output(self.sda, GPIO.LOW)
                self._delay()
                GPIO.output(self.scl, GPIO.HIGH)
                self._delay()
                GPIO.output(self.sda, GPIO.HIGH)
                self._delay()

            def _write_byte(self, byte):
                GPIO.setup(self.sda, GPIO.OUT)
                for i in range(8):
                    bit = (byte >> (7 - i)) & 1
                    GPIO.output(self.sda, bit)
                    self._delay()
                    GPIO.output(self.scl, GPIO.HIGH)
                    self._delay()
                    GPIO.output(self.scl, GPIO.LOW)
                    self._delay()

                # Read ACK
                GPIO.setup(self.sda, GPIO.IN, pull_up_down=GPIO.PUD_UP)
                self._delay()
                GPIO.output(self.scl, GPIO.HIGH)
                self._delay()
                ack = GPIO.input(self.sda)
                GPIO.output(self.scl, GPIO.LOW)
                self._delay()
                return ack == 0

            def scan(self):
                found = []
                for addr in range(0x08, 0x78):
                    self._start()
                    if self._write_byte(addr << 1):
                        found.append(addr)
                    self._stop()
                    self._delay()
                return found

            def writeto(self, addr, buf):
                self._start()
                if not self._write_byte(addr << 1):
                    self._stop()
                    return False
                for b in buf:
                    self._write_byte(b)
                self._stop()
                return True

        i2c = SoftI2C(sda=14, scl=15)
        print("Using built-in RPi.GPIO Software I2C.")
    except Exception as e:
        print(f"Error initializing GPIO I2C: {e}")
        print("Please install bitbangio: pip install adafruit-circuitpython-bitbangio")
        sys.exit(1)


def set_rgb(r, g, b):
    i2c.writeto(RGB_ADDR, [0x00, 0x00])
    i2c.writeto(RGB_ADDR, [0x01, 0x00])
    i2c.writeto(RGB_ADDR, [0x08, 0xAA])
    i2c.writeto(RGB_ADDR, [0x04, r])
    i2c.writeto(RGB_ADDR, [0x03, g])
    i2c.writeto(RGB_ADDR, [0x02, b])


def lcd_cmd(cmd):
    i2c.writeto(LCD_ADDR, [0x80, cmd])


def lcd_data(data):
    i2c.writeto(LCD_ADDR, [0x40, data])


def init_lcd():
    time.sleep(0.05)
    lcd_cmd(0x28)  # 2 lines, 5x8 font
    time.sleep(0.005)
    lcd_cmd(0x0C)  # display on, cursor off
    time.sleep(0.005)
    lcd_cmd(0x01)  # clear display
    time.sleep(0.01)


def show_text(line1, line2=""):
    lcd_cmd(0x01)
    time.sleep(0.005)
    for c in line1[:16]:
        lcd_data(ord(c))
    if line2:
        lcd_cmd(0xC0)  # Move to line 2
        time.sleep(0.001)
        for c in line2[:16]:
            lcd_data(ord(c))


def main():
    print("=" * 60)
    print("Testing Grove RGB LCD on SDA=GPIO14, SCL=GPIO15...")
    print("=" * 60)

    found = i2c.scan()
    print(f"I2C scan results: {[hex(x) for x in found]}")

    print("Initializing LCD...")
    init_lcd()

    # Cycle RGB colors
    colors = [
        ("GREEN", 0, 255, 0),
        ("BLUE", 0, 100, 255),
        ("RED", 255, 0, 0),
    ]

    for name, r, g, b in colors:
        print(f"Color: {name}")
        set_rgb(r, g, b)
        show_text("Smart Garden", f"Backlight: {name}")
        time.sleep(2)

    set_rgb(0, 255, 100)
    show_text("Smart Garden", "LCD Test OK!")
    print("\nTest finished! Display is active.")


if __name__ == "__main__":
    main()
