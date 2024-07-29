import * as logger from "./components/logger";
import express, { Request, Response } from 'express';
import { MM } from './mm';
import { readJson } from "./components/utils";
import { CONFIG_PATH } from "./components/constants";
import { Config } from "./components/interfaces";

logger.setLevel("DEBUG");

(async () => {
    const config: Config = await readJson(CONFIG_PATH);
    const mm = new MM(config)

    const app = express();
    app.use(express.json());

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
        let updateBalance = true;
        let randomSleepTime = true;
        if ("updateBalance" in req.query) {
            updateBalance = ("true" == req.query.updateBalance)
        }
        if ("randomSleepTime" in req.query) {
            randomSleepTime = ("true" == req.query.randomSleepTime)
        }
        mm.sellFromAll(updateBalance, randomSleepTime);
        res.send("sell all");
      });
    
      app.get('/showbalance', (req: Request, res: Response) => {
        mm.getAllBalance();
        res.send("show balance");
      });
    
      app.get('/buyamountinsol/:solamount', (req: Request, res: Response) => {
        let randomTx = false;
        if ("randomTx" in req.query) {
          randomTx = ("true" == req.query.randomTx)
        }

        const solAmount = Number.parseFloat(req.params['solamount'])
        mm.buyAmountSol(solAmount, randomTx);

        res.send(`buy ${solAmount} SOL with ${randomTx}`);
      });
    
    
      app.get("/sellamountinpercents/:percentsamount", (req: Request, res: Response) => {
        let randomTx = false;
        if ("randomTx" in req.query) {
          randomTx = ("true" == req.query.randomTx)
        }

        const percentAmount = Number.parseFloat(req.params['percentsamount'])
        mm.sellAmountInPercents(percentAmount, randomTx);

        res.send(`sell ${percentAmount}% with ${randomTx}`)
      });
    
    app.get("/generatewallets/:n", (req: Request, res: Response) => {
        const n = Number.parseInt(req.params['n'])
        mm.generateWallets(n);
        res.send(`generation started`)
      });
    
    app.get("/reloadconfigfile", (req: Request, res: Response) => {
        (async () => {
            const newconfig = await readJson(CONFIG_PATH);
            mm.reloadConfig(newconfig);
            res.send("reloading has ended")
        })()
      });
    
    app.post("/reloadconfig", (req: Request, res: Response) => {
      let cloneConfig: Config = {...mm.config};

      for (let key in cloneConfig) {
        if (key in req.body) {
          cloneConfig[key] = req.body[key];
        }
      }
      mm.reloadConfig(cloneConfig);
      res.send(cloneConfig);
      });

    app.get("/getconfig", (req: Request, res: Response) => {
        res.send(mm.config);
    })
    
    app.get("/withdrawall/:address", (req: Request, res: Response) => {
        mm.withdrawall(req.params['address'])
        res.send('withdraw');
    })

    app.get("/saveonlydispatchedwallets", (req: Request, res: Response) => {
      mm.savePKOnlyFromConf()
      res.send('saved');
  })

    app.get("/savestatistic", (req: Request, res: Response) => {
      mm.saveStatistic()
      res.send("statistic has been saved!")
})

    app.get("/rebalance", (req: Request, res: Response) => {
      mm.rebalanceWallets();
      res.send("rebalancing has started!")
    })
    app.listen(3000, () => {
        console.log(`Server running at http://localhost:${3000}`);
    });
    
})()