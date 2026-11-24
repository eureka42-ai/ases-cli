// fixture: servidor HTTP e porta TCP são proibidos (AER-REQ-009)
import http from 'node:http';

http.createServer(() => undefined).listen(8080);
