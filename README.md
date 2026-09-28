# Smart Garden – Sensor Tests

Small programs that check each sensor on its own, before we build the full Smart Garden program.

| Sensor | Test program |
|---|---|
| DHT11 (temperature / humidity) | `raspberry-pi/test_dht11.py` |
| Light sensor (DO) | `raspberry-pi/test_light_sensor.py` |

## Wiring (Raspberry Pi J8 header)

| Sensor | Sensor pin | Connect to |
|---|---|---|
| DHT11 | VCC | Pin 1 (3V3) |
| | GND | Pin 6 (GND) |
| | SIG | Pin 7 (GPIO4) |
| | NC | not connected |
| Light sensor | VCC | Pin 17 (3V3) |
| | GND | Pin 9 (GND) |
| | DO | Pin 11 (GPIO17) |

**Watch out for:**

- **Do all the wiring with the power off.**
- **Bare DHT11:** if your DHT11 is just the blue sensor with 4 legs (no small circuit board under it), put a **4.7 kΩ–10 kΩ resistor between VCC and SIG**. DHT11 modules on a board already have this resistor.

## Copy the tests to the Raspberry Pi

In PowerShell on this PC (replace `<user>` and `<pi-name>` with your Pi's username and hostname):

```bash
scp -r "Z:\Desktop\Smart Garden\raspberry-pi" <user>@<pi-name>.local:~/smart-garden
```

A USB stick works too.

## 1. DHT11

**One-time setup.** This turns on the Pi's built-in DHT11 driver, so you don't need to install any libraries:

1. `sudo nano /boot/firmware/config.txt` (on older Raspberry Pi OS: `/boot/config.txt`)
2. Add this line at the very bottom: `dtoverlay=dht11,gpiopin=4`
3. Save (Ctrl+O, Enter, Ctrl+X) and reboot: `sudo reboot`

**Run:**

```bash
cd ~/smart-garden && python3 test_dht11.py
```

**When it works:** you get a new reading every 2 seconds, and humidity goes up when you breathe on the sensor. Press Ctrl+C to see the summary. The DHT11 sometimes fails a single read. That's normal as long as most reads work.

## 2. Light sensor

```bash
cd ~/smart-garden && python3 test_light_sensor.py
```

Every time you press Enter it prints `DARK` or `LIGHT`. Press Ctrl+C to quit.
If it never changes, turn the blue potentiometer on the module.