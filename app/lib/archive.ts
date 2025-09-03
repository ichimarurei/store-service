import { DocumentScope, MangoResponse } from 'nano';
import handshakeArchiveDB from '../couchdb';

const archiveSort = async (couchdb: DocumentScope<any>, model: string) => {
    const sorter: { [key: string]: any[] } = {
        products: [{ inventory: 'desc' }],
        receipts: [{ date: 'desc' }, { 'author.created.time': 'desc' }, { reference: 'desc' }],
        sales: [{ date: 'desc' }, { 'author.created.time': 'desc' }, { reference: 'desc' }],
        debts: [{ date: 'desc' }, { 'author.created.time': 'desc' }, { money: 'desc' }]
    };

    if (model === 'products') {
        await couchdb.createIndex({ index: { fields: ['inventory'] }, name: 'inventory_index' });
    } else if (['receipts', 'sales'].includes(model)) {
        await couchdb.createIndex({ index: { fields: ['date', 'author.created.time', 'reference'] }, name: 'transaction_index' });
    } else {
        await couchdb.createIndex({ index: { fields: ['date', 'author.created.time', 'money'] }, name: 'debt_index' });
    }

    return sorter[model];
};

const getArchivedRecords = async (model: string, period?: string) => {
    let records: any[] = [];

    try {
        const archiveDb = await handshakeArchiveDB();

        if (archiveDb) {
            let list: MangoResponse<any> | undefined;

            if (period) {
                const limiter = await archiveDb.find({ selector: { model: 'sum', period }, limit: 1 });

                if (model === 'analytics') {
                    list = limiter;
                } else {
                    list = await archiveDb.find({ selector: { model, period }, sort: await archiveSort(archiveDb, model), limit: (limiter?.docs[0]?.[model] ?? 1) * 2 });
                }
            } else {
                list = await archiveDb.find({ selector: { model } });
            }

            records = list?.docs ?? [];
        }
    } catch (error) {
        console.error(error);
    }

    return records;
};

export default getArchivedRecords;
