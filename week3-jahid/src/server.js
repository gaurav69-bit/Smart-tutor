import { createServer } from 'node:http';
import { handleRequest } from './api.js';
const port = Number(process.env.PORT || 3001);
createServer(handleRequest).listen(port, () => console.log('Validation-only demo on port ' + port));
