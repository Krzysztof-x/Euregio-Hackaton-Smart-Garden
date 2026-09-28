#!/usr/bin/env python3
"""
test_lcd.py - Test Grove LCD RGB Backlight (JHD1313M3) on Raspberry Pi

Hardware I2C Pins on Raspberry Pi:
  SDA = Pin 3 (GPIO 2)
  SCL = Pin 5 (GPIO 3)
  VCC = Pin 2 (5V Power)
  GND = Pin 6 (Ground)
"""

import time
import sys

try:
    import board
    i2c = board.I2C()  # Uses hardware I2C on Pin 3 (SDA) and Pin 5 (SCL)
except Exception as e:
    print(f"Error initializing hardware I2C: {e}")
    sys.exit(1)

LCD_ADDR = 0x3E
# Grove LCD RGB variants use either 0x62 or 0x30/0x60 for RGB
RGB_ADDR = 0x62


def set_rgb(r, g, b):
    while not i2c.try_lock():
        pass
    try:
        if RGB_ADDR == 0x62:
            i2c.writeto(RGB_ADDR, bytes([0x00, 0x00]))
            i2c.writeto(RGB_ADDR, bytes([0x01, 0x00]))
            i2c.writeto(RGB_ADDR, bytes([0x08, 0xAA]))
            i2c.writeto(RGB_ADDR, bytes([0x04, r]))  # Red
            i2c.writeto(RGB_ADDR, bytes([0x03, g]))  # Green
            i2c.writeto(RGB_ADDR, bytes([0x02, b]))  # Blue
        else:
            i2c.writeto(RGB_ADDR, bytes([0x00, 0x00]))
            i2c.writeto(RGB_ADDR, bytes([0x01, 0x05]))
            i2c.writeto(RGB_ADDR, bytes([0x02, b]))
            i2c.writeto(RGB_ADDR, bytes([0x03, g]))
            i2c.writeto(RGB_ADDR, bytes([0x04, r]))
    except Exception as e:
        print(f"RGB write error: {e}")
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
        lcd_cmd(0xC0)  # Move to second line
        time.sleep(0.001)
        for c in line2[:16]:
            lcd_data(ord(c))


def main():
    global RGB_ADDR
    print("=" * 60)
    print("Grove LCD RGB Test (Hardware I2C on Pin 3 & Pin 5)")
    print("=" * 60)

    # I2C Scan
    while not i2c.try_lock():
        pass
    found = i2c.scan()
    i2c.unlock()

    print(f"Detected I2C devices: {[hex(x) for x in found]}")

    if LCD_ADDR not in found:
        print(f"\n[!] Error: LCD controller ({hex(LCD_ADDR)}) not found!")
        print("Please check wiring:")
        print("  - SDA -> Pin 3 (GPIO 2)")
        print("  - SCL -> Pin 5 (GPIO 3)")
        print("  - VCC -> Pin 2 (5V)")
        print("  - GND -> Pin 6 (GND)")
        return

    # Auto-detect RGB controller address
    if 0x62 in found:
        RGB_ADDR = 0x62
    elif 0x30 in found:
        RGB_ADDR = 0x30
    elif 0x60 in found:
        RGB_ADDR = 0x60

    print(f"Using LCD at {hex(LCD_ADDR)}, RGB at {hex(RGB_ADDR)}")
    print("Initializing LCD...")
    init_lcd()

    # Cycle test colors
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
    print("\n[✓] Test completed! Display is active.")


if __name__ == "__main__":
    main()
