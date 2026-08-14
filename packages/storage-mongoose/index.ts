import { createConnection, Connection } from 'mongoose';
import { AuditEvent, StorageProvider } from '@audit-framework/core';
import { EventModel } from './Schemas/storageSchemas.js';


// interface for Mongoose options
export interface MongooseStorageOptions {
    connectionString? : string;
    colletionName? : string;
}




// Class to implement Storage Provider
export class MongooseStorage implements StorageProvider {
    public name = 'mongoose-storage';
    private collectionName : string;
    private conn? : Connection;

    // For testing // In memory fallback mode
    private inMemoryFallback : AuditEvent[] = [];
    private isFallbackMode = false;


    constructor(options : MongooseStorageOptions = {}) {
        this.collectionName = options.colletionName || 'audit-logs';
        
        if (options.connectionString) {
            this.conn = createConnection(options.connectionString);
        } else {
            this.isFallbackMode = true;
             console.warn(
                "[MongooseStorage] No connection parameters provided. Running in in-memory fallback mode."
            );
        }
    } 

    public async save (event : AuditEvent) : Promise <void> {
        // Save in memory when fallback mode
        if (this.isFallbackMode){
            this.inMemoryFallback.push(event);
            console.log(`[MongooseStorage (Mock DB insert) Save event: ${event.action} (${event.id})]`);
        }

        const ev = new EventModel()

    }

    public async query(filter: Record<string, any>): Promise<AuditEvent[]> {
        
    }
}