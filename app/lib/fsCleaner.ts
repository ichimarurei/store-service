import dayjs from 'dayjs';
import 'dayjs/locale/id';
import { promises } from 'fs';
import { first, last } from 'lodash';
import { tempDir } from './global';

dayjs.locale('id');

const cleaner = () => {
    console.info('Janitor running ...');

    // Handle async operations without blocking the cron job
    promises
        .stat(tempDir)
        .then((stat) => {
            if (stat.isDirectory()) {
                return promises.readdir(tempDir);
            }

            return [];
        })
        .then((junks) => {
            for (const junk of junks) {
                promises
                    .stat(`${tempDir}/${junk}`)
                    .then((trash) => {
                        if (trash.isFile()) {
                            const names = junk.split('-');

                            if (['receipt', 'sales'].includes(first(names) ?? '') && last(names)?.toLowerCase()?.endsWith('.pdf')) {
                                const timestamp = Number(last(names)?.replace('.pdf', ''));

                                if (dayjs().diff(dayjs.unix(timestamp), 'minutes') >= 3) {
                                    promises.unlink(`${tempDir}/${junk}`).catch((error) => {
                                        console.error('Error deleting file:', junk, error);
                                    });
                                }
                            }
                        }
                    })
                    .catch((error) => {
                        console.error('Error checking file:', junk, error);
                    });
            }
        })
        .catch((error) => {
            console.error('Error in cron job:', error);
        });
};

export default cleaner;
