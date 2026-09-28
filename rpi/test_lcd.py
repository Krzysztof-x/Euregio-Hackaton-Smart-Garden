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

try:
    import board
    import bitbangio
    # Initialize software I2C on GPIO 14 (SDA) and GPIO 15 (SCL)
    i2c = bitbangio.I2C(scl=board.D15, sda=board.D14)
except Exception as e:
    print(f"Error loading board/bitbangio: {e}")
    print("Make sure adafruit-blinka is installed: pip install adafruit-blinka")
    sys.exit(1)

LCD_ADDR = 0x3E
RGB_ADDR = 0x62


def set_rgb(r, g, b):
    while not i2c.try_lock():
        pass
    try:
        i2c.writeto(RGB_ADDR, bytes([0x00, 0x00]))
        i2c.writeto(RGB_ADDR, bytes([0x01, 0x00]))
        i2c.writeto(RGB_ADDR, bytes([0x08, 0xAA]))
        i2c.writeto(RGB_ADDR, bytes([0x04, r]))
        i2c.writeto(RGB_ADDR, bytes([0x03, g]))
        i2c.writeto(RGB_ADDR, bytes([0x02, b]))
    finally:
        i2c.unlock()


def lcd_cmd(cmd):
    while not i2c.try_lock():
        pass
    try:
        i2c.writeto(LCD_ADDR, bytes([0x80, cmd]))
    finally:
        i2c.unlock()


def lcd_data(data):
    while not i2c.try_lock():
        pass
    try:
        i2c.writeto(LCD_ADDR, bytes([0x40, data]))
    finally:
        i2c.unlock()


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

    # I2C Scan
    while not i2c.try_lock():
        pass
    found = i2c.scan()
    i2c.unlock()

    print(f"I2C scan results: {[hex(x) for x in found]}")
    if LCD_ADDR not in found:
        print(f"Warning: LCD address {hex(LCD_ADDR)} not detected on SDA/SCL!")

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
