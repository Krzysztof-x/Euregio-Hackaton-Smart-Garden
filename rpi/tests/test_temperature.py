#!/usr/bin/env python3
import time
import random
import sys

# Attempt to load Raspberry Pi hardware libraries
try:
    import board
    import adafruit_dht
    HARDWARE_MODE = True
except (ImportError, NotImplementedError):
    HARDWARE_MODE = False

# ---------------------------------------------------------
# Simulated Sensor (Runs if you test this on a PC/Mac)
# ---------------------------------------------------------
class MockDHT11:
    def __init__(self):
        self._temp = 22.0
        self._humidity = 45.0
        print("⚠️  WARNING: Hardware libraries not found or not on a Raspberry Pi.")
        print("⚙️  Running in SIMULATION MODE with mock data.\n")

    @property
    def temperature(self):
        # Simulate slight temperature fluctuations
        self._temp += random.uniform(-0.5, 0.5)
        return round(self._temp, 1)

    @property
    def humidity(self):
        # Simulate slight humidity fluctuations
        self._humidity += random.uniform(-2.0, 2.0)
        return round(self._humidity, 1)

    def exit(self):
        pass

# ---------------------------------------------------------
# Main Program
# ---------------------------------------------------------
def main():
    print("=" * 45)
    print(" DHT11 Temperature & Humidity Reader")
    print("=" * 45)

    # 1. Initialize the Sensor
    if HARDWARE_MODE:
        # If your data wire is on a different pin, change board.D4 below.
        # Example: if wired to GPIO 17, use board.D17
        try:
            dht_device = adafruit_dht.DHT11(board.D4)
            print("✅ Hardware sensor initialized on GPIO 4.")
        except Exception as e:
            print(f"❌ Failed to initialize sensor: {e}")
            sys.exit(1)
    else:
        # Fallback to test mode if not on a Pi
        dht_device = MockDHT11()

    print("Press Ctrl+C to stop reading.\n")

    # 2. Continuous Reading Loop
    try:
        while True:
            try:
                # Ask the sensor for data
                temperature = dht_device.temperature
                humidity = dht_device.humidity
                
                # Format the current time
                current_time = time.strftime("%H:%M:%S")

                if temperature is not None and humidity is not None:
                    print(f"[{current_time}] Temp: {temperature:.1f}°C  |  Humidity: {humidity:.1f}%")
                else:
                    print(f"[{current_time}] Sensor returned None. Retrying...")

            except RuntimeError as error:
                # DHT sensors are timing-critical and drop reads occasionally. 
                # This is normal behavior. We catch the error and keep going.
                print(f"[{time.strftime('%H:%M:%S')}] Sensor read error: {error.args[0]}")
                time.sleep(2.0)
                continue
            except Exception as error:
                # Catch fatal errors (like the sensor being completely disconnected)
                print(f"Fatal error: {error}")
                dht_device.exit()
                raise error

            # The DHT11 sensor can only be read once every 2 seconds.
            time.sleep(2.0)

    except KeyboardInterrupt:
        # Triggers when you press Ctrl+C
        print("\nStopping tests...")
    finally:
        dht_device.exit()
        print("Cleanup complete.")

if __name__ == "__main__":
    main()