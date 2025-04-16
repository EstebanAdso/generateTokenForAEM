import express from 'express';
import bodyParser from 'body-parser';
import apiRoutes from './routes/apiRoutes.js';

const app = express();
const port = process.env.PORT || 3000;

//Middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use('/api', apiRoutes);

app.listen(port, () => {
    console.log(`Servidor Express corriendo en http://localhost:${port}`);
});