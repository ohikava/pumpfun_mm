import * as logger from "./components/logger";
import express, { Request, Response } from 'express';
import { MM } from './mm';
import { readJson } from "./components/utils";
import { CONFIG_PATH } from "./components/constants";
import { Config } from "./components/interfaces";

logger.setLevel("INFO");

(async () => {
    const config: Config = await readJson(CONFIG_PATH);
    const mm = new MM(config)

    const app = express();
    app.get('/', (req: Request, res: Response) => {
        res.send('Hello, TypeScript Express!');
      });
    
    app.get('/start', (req: Request, res: Response) => {
        mm.start();
        res.send("started");
      });
    
    app.get('/buyall', (req: Request, res: Response) => {
        mm.buyFromAll();
        res.send("buy all");
    });
    
      app.get('/sellall', (req: Request, res: Response) => {
        mm.sellFromAll();
        res.send("sell all");
      });
    
      app.get('/showbalance', (req: Request, res: Response) => {
        mm.getAllBalance();
        res.send("show balance");
      });
    
      app.get('/buyamountinsol/:solamount', (req: Request, res: Response) => {
        const solAmount = Number.parseFloat(req.params['solamount'])
        mm.buyAmountSol(solAmount);
        res.send(`buy ${solAmount} SOL`);
      });
    
    
      app.get("/sellamountinpercents/:percentsamount", (req: Request, res: Response) => {
        const percentAmount = Number.parseFloat(req.params['percentsamount'])
        mm.sellAmountInPercents(percentAmount);
        res.send(`sell ${percentAmount}%`)
      });
    
    app.get("/generatewallets/:n", (req: Request, res: Response) => {
        const n = Number.parseInt(req.params['n'])
        mm.generateWallets(n);
        res.send(`generation started`)
      });
    
    app.get("/reloadconfig", (req: Request, res: Response) => {
        (async () => {
            const newconfig = await readJson(CONFIG_PATH);
            mm.reloadConfig(newconfig);
            res.send("reloading has ended")
        })()
      });

    app.get("/getconfig", (req: Request, res: Response) => {
        res.send(mm.config);
    })
    
    app.listen(3000, () => {
        console.log(`Server running at http://localhost:${3000}`);
    });
    
})()