import * as amqp from 'amqplib'

const NUM_QUEUES = 12
const NUM_BINDINGS = 25_000
// const NUM_BINDINGS = 1_000

const randomString = () => Math.random().toString(36).substring(2)

const randomElement = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

const ids = (() => {
  const result = new Set<string>()
  while (result.size < NUM_BINDINGS) {
    result.add(randomString())
  }
  return [...result]
})()

const time = async (label: string, fn: () => Promise<void>) => {
  console.time(label)
  await fn()
  console.timeEnd(label)
}

const createChannel = async () => {
  const connection = await amqp.connect({
    hostname: 'localhost',
    username: 'example',
    password: 'example',
  })
  return connection.createConfirmChannel()
}

const setup = async (exchangeName: string, exchangeType: string) => {
  const channel = await createChannel()
  const { exchange } = await channel.assertExchange(exchangeName, exchangeType, { durable: true })
  const queues = await Promise.all(
    Array.from({ length: NUM_QUEUES }, async (_, i) => {
      const { queue } = await channel.assertQueue(`queue-${i}`, { durable: false, expires: 60_000 })
      return queue
    }),
  )
  await channel.prefetch(5, true)

  return {
    channel,
    exchange,
    queues,
  }
}

const testTopic = async () => {
  const { channel, exchange, queues } = await setup(`topic-${randomString()}`, 'topic')
  try {
    await time('topic bind', async () => {
      await Promise.all(
        ids.map(async (id) => {
          const queue = randomElement(queues)
          await channel.bindQueue(queue, exchange, `#.${id}.#`)
          await channel.unbindQueue(queue, exchange, `#.${id}.#`)
        }),
      )
    })
  } finally {
    await Promise.all([channel.deleteExchange(exchange), ...queues.map((queue) => channel.deleteQueue(queue))])
    await channel.connection.close()
  }
}

const testDirect = async () => {
  const { channel, exchange, queues } = await setup(`direct-${randomString()}`, 'direct')
  try {
    await time('direct bind', async () => {
      await Promise.all(
        ids.map(async (id) => {
          const queue = randomElement(queues)
          await channel.bindQueue(queue, exchange, id)
          await channel.unbindQueue(queue, exchange, id)
        }),
      )
    })
  } finally {
    await Promise.all([channel.deleteExchange(exchange), ...queues.map((queue) => channel.deleteQueue(queue))])
    await channel.connection.close()
  }
}

export const run = async (): Promise<void> => {
  await testTopic()
  await testDirect()
  console.log('done')
}

void run().catch((error: unknown) => console.error(error))
