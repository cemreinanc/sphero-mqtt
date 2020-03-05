const consola = require('consola')
const MQTT = require('async-mqtt')

const config = require('./config')
const sphero = require('./lib')

const logger = consola.withTag('sphero')
const mqLogger = consola.withTag('mqtt')
const client = MQTT.connect(config.mqtt.server, { 
    username: config.mqtt.username,
    password: config.mqtt.password,
    queueQoSZero: false
})
mqLogger.info(`Connecting to MQTT Broker at ${config.mqtt.server}...`)

client.on('connect', () => {
    mqLogger.success(`MQTT Connected to ${config.mqtt.server}`)
    client.subscribe(`${config.mqtt.channel}/cmd`)
    mqLogger.success(`MQTT Subscribed to ${config.mqtt.channel}`)
})

client.on('message', function (topic, message) {
    mqLogger.info('New Message:', message.toString())
})

const mqttError = function (err) {
    mqLogger.warn(err)
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

const arrAvg = arr => arr.reduce((a,b) => a + b, 0) / arr.length

const tryToConnect = async (i = 0) => {
    try {
        let port = config.port
        if (Array.isArray(config.port)) {
            port = config.port[i % config.port.length]
        }

        logger.info(`Connecting to ${port}...`)
        const orb = sphero(port)
        await orb.connect()
        return { orb, port }
    } catch (e) {
        logger.error(e.message)
        await sleep(3000)
        return tryToConnect(++i)
    }
}

const connected = async ({ orb, port }) => {
    const cmd = async (name, ...params) => {
        return tryToSendCommand(0, orb[name], ...params)
    }
    let gyroSps = 1
    let movementHistory = []

    logger.success(`Connected to Sphero on ${port}`)
    await cmd('ping')
    await cmd('color', '00FF00')

    await cmd('setPowerNotification', 1)
    await cmd('setStabilization', 0)
    await cmd('streamGyroscope', gyroSps)

    await cmd('setPermOptionFlags', {
        sleepOnCharger: true, // Works inversed! should be (noSleepOnCharger)
        vectorDrive: false,
        selfLevelOnCharger: false, // Works inversed! should be (noSelfLevelOnCharger)
        tailLedAlwaysOn: false,
        motionTimeouts: true,
        retailDemoOn: false,
        awakeSensitivityLight: true,
        awakeSensitivityHeavy: false,
        gyroMaxAsyncMsg: true
    })

    setInterval(async () => {
        try {
            await cmd('ping')
        } catch (e) {
            logger.error('Cannot ping the device:', e)
            process.exit(1)
        }
    }, 10000)

    const { batteryState } = await cmd('getPowerState')
    logger.info(`Battery State: ${batteryState}`)

    orb.on('battery', ({ state }) => {
        client.publish(`${config.mqtt.channel}/battery`, state).catch(mqttError)
        if (!['Battery OK', 'Battery Charging'].includes(state)) {
            logger.warn('Battery State:', state)
        }
    })

    orb.on('dataStreaming', async (data) => {
        try {
            const obj = {
                gyro: [data.xGyro.value[0], data.yGyro.value[0], data.zGyro.value[0]],
                // accel: [data.xAccel.value[0], data.yAccel.value[0], data.zAccel.value[0]]
            }
            const gyroMax = Math.max(...obj.gyro.map(i => { return Math.abs(i) }))

            //client.publish(`${config.mqtt.channel}/sensor`, JSON.stringify(obj)).catch(mqttError)
            client.publish(`${config.mqtt.channel}/gyro`, obj.gyro.join(',')).catch(mqttError)

            movementHistory.unshift(gyroMax)
            if (movementHistory.length > 5) {
                movementHistory.pop()
            }
            const avg = arrAvg(movementHistory)
    
            if (avg < 150) {
                await cmd('color', '000000')
                if (gyroSps !== 1) {
                    gyroSps = 1
                    await cmd('streamGyroscope', gyroSps)
                }
                await ('sleep', 1, 0, 0)
            } else if (gyroMax > 300) {
                const maxVal = 10000
                const cappedMovement = Math.min(gyroMax, maxVal)
                await cmd('randomColor', ((cappedMovement / maxVal) - 0.5))
                if (gyroSps !== 10) {
                    gyroSps = 10
                    await cmd('streamGyroscope', gyroSps)
                }
            }
            logger.debug('Stream Data:', gyroMax)
        } catch (e) {
            logger.warn(e)
        }
    })

}

consola.wrapAll()
tryToConnect().then(connected).catch((err) => {
    logger.error(err)
    process.exit(1)
})

const tryToSendCommand = async (count, ftr, ...params) => {
    try {
        const response = await ftr(...params)
        return response
    } catch (e) {
        if (count > 10) {
            throw e
        }
        logger.warn(e)
        await sleep(500)
        return tryToSendCommand(++count, ftr, ...params)
    }
}