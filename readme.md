# Sphero-Mqtt

## Config
All config options are avaiable in `./config.json` file.
### Port

Sphero Serial Port configuration. 
- On Windows `COM3`, `COM7`, etc.
- On MacOSX `/dev/tty.Sphero.OYB-ATC`, etc.
- On Linux `/dev/rfcomm0`, etc.

Also this can be set as an array like `["COM3", "COM5"]` to try alternative ports when connetion to device failed.

### Mqtt
#### Server
MQTT broker address to connect.
#### Channel
MQTT topic prefix to apply all incoming/outgoing messages.
#### Username (optional)
When set, mqtt client uses this information to authenticate.
#### Password (optional)
When set, mqtt client uses this information to authenticate.

## MQTT Messages
### sphero/gyro
Streams the gyro data in format: `0,0,0`
All integers seperated with a comma.
Min/Max Limits: `-20000, +20000`

### sphero/battery
Periodically updates battery information in string format.
Available values are: "`Battery OK`", "`Battery Charging`", "`Battery Low`", "`Battery Critical`"

## Setup and Operation

### Standard Run (No-Daemon Mode)
```
> npm install
> npm start
```


### Windows Daemon Mode (with pm2)
```
> npm i pm2 pm2-windows-startup -g
> pm2-startup install

...

> npm install
> pm2 start
> pm2 save
```