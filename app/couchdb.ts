import nano, { DocumentScope } from 'nano';

const handshakeArchiveDB = async () => {
    let couchdb: DocumentScope<any> | undefined;
    const client = nano(process.env.COUCHDB_URL ?? '');

    try {
        if (process.env.NOSQL_DATABASE) {
            // Create DB if not exists
            const exists = await client.db.list();

            if (!exists.includes(process.env.NOSQL_DATABASE)) {
                await client.db.create(process.env.NOSQL_DATABASE);
            }

            couchdb = client.db.use(process.env.NOSQL_DATABASE);

            // Create index for efficient queries
            if (couchdb) {
                await couchdb.createIndex({ index: { fields: ['model', 'period'] }, name: 'archive_index' });
            }
        }
    } catch (error) {
        console.error('Cannot connect to CouchDB !!!', error);
    }

    return couchdb ?? null;
};

export default handshakeArchiveDB;
