import { Readable } from 'stream';
import * as messages from '@cucumber/messages';

/**
 * Converts a readable stream into an array of messages.Envelope
 */
export async function streamToArray(readableStream: Readable): Promise<messages.Envelope[]> {
  return new Promise<messages.Envelope[]>((resolve, reject) => {
    const items: messages.Envelope[] = [];
    readableStream.on('data', (item) => items.push(item));
    readableStream.on('error', (err) => reject(err));
    readableStream.on('end', () => resolve(items));
  });
}
