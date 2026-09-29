#!/usr/bin/env python3
"""
test_light_sensor.py - Light sensor test
Press Enter to read the sensor, Ctrl+C to quit.

Wiring: VCC -> Pin 17 (3V3), GND -> Pin 9 (GND), DO -> Pin 11 (GPIO17)
"""

from gpiozero import DigitalInputDevice

# The sensor's DO pin is connected to GPIO17 (physical pin 11).
# The module itself drives the pin, so we don't use the Pi's internal resistor (pull_up=None).
# active_state=True means: sensor.value is 1 when the pin is HIGH, 0 when LOW.
sensor = DigitalInputDevice(17, pull_up=None, active_state=True)

print("Press Enter to read the light sensor (Ctrl+C to quit)")

while True:
    input()  # wait until Enter is pressed
    # The module outputs HIGH (1) when it's dark and LOW (0) when it's light.
    if sensor.value == 1:
        print("DARK")
    else:
        print("LIGHT")
