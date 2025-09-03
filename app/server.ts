import fastifyCors from '@fastify/cors';
import fastifyRedis from '@fastify/redis';
import dayjs from 'dayjs';
import 'dayjs/locale/id';
import fastify from 'fastify';
import fastifyCron from 'fastify-cron';
import puppeteer from 'puppeteer';
import { print } from 'unix-print';
import analyzing from './lib/analytics';
import getArchivedRecords from './lib/archive';
import cleaner from './lib/fsCleaner';
import { STOCK_STATE, tempDir } from './lib/global';
import stockTaking from './lib/opname';
import { awaitPrinting, pickRandPrinter } from './lib/print';
import syncStock from './lib/sync';

dayjs.locale('id');

const goRun = async () => {
    const server = fastify({ logger: true });

    try {
        // setup
        server.register(fastifyCors, { origin: '*' });
        server.register(fastifyRedis, { url: process.env.REDIS_URL });
        server.register(fastifyCron, {
            jobs: [
                { cronTime: '0 */2 * * *', start: true, onTick: cleaner }, // Every 2 hours
                {
                    cronTime: '*/3 * * * *', // Every 3 minutes
                    start: true,
                    onTick: () => {
                        const { redis } = server;
                        analyzing(redis);
                    }
                }
            ]
        });

        // routes
        server.get('/', (_, response) => response.send({ status: 'Running ...' }));

        server.get('/stock', async (_, response) => {
            const { redis } = server;
            await redis.set(STOCK_STATE.SYNC, 'true');
            await syncStock();
            await redis.set(STOCK_STATE.STOP, 'true');
            await redis.del(STOCK_STATE.SYNC, STOCK_STATE.CACHED);
            response.send({ status: 'Synced ...' });
        });

        server.get('/take/stock', async (_, response) => {
            const { redis } = server;
            const archived = await stockTaking(redis);
            await redis.del(STOCK_STATE.TAKE);
            response.send({ status: !archived ? 'Failed !!!' : 'Archived ...' });
        });

        server.get('/print/:section/:id', async (request, response) => {
            const { section, id } = request.params as any;
            let printed = false;

            if (id && section) {
                const printPath = `${tempDir}/${section}-${id}-${dayjs().unix()}.pdf`;

                try {
                    const browser = await puppeteer.launch({ headless: true, args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox'] });
                    const page = await browser.newPage();
                    await page.goto(`${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/printout/${section}/${id}`, { waitUntil: 'networkidle0' });
                    const generated = await page.pdf({ path: printPath, format: 'A4', landscape: true });
                    await browser.close();

                    if (generated) {
                        const device = await pickRandPrinter();

                        if (device) {
                            const job = await print(printPath, device.printer, ['-o landscape', '-o fit-to-page', '-o media=A4']);
                            printed = await awaitPrinting(job);
                        }
                    }
                } catch (error) {
                    console.error(error);
                }
            }

            response.send({ printed });
        });

        server.get('/history', async (_, response) => response.send(await getArchivedRecords('period')));

        server.get('/history/:model/:period', async (request, response) => {
            const { model, period } = request.params as any;
            const records = await getArchivedRecords(model, period);
            response.send(records);
        });

        await server.listen({ port: 8001, host: '0.0.0.0' });
        console.info('Fastify server is running ...');
    } catch (error) {
        console.error(error);
    }
};

goRun();
