const request = require('request');
const fs = require('fs');
const cheerio = require('cheerio');
const Discord = require('discord.js');
const { parse } = require('path');
const { skips } = require('debug');

let kicksByHohnWebhook = new Discord.WebhookClient('744333395492077599', 'hLFb-AumipBnMtNKa1kzaQiAG5zeVZVbOrybunC4NsDgkEGitdom1i5iEO29AmwBZ7Z8');

let interval = 5000;

const BitlyClient = require('bitly').BitlyClient;
const bitly = new BitlyClient('66c444a165d2982771beb4d7e079f2cffceb3d60');

// Proxies 
const text = fs.readFileSync("./proxies.txt", "utf-8");
const textByLine = text.split("\n")
var formattedProxies = new Array();
for (i = 0; i < textByLine.length; i++) {
    textByLine[i].trim();
    var split = textByLine[i].split(":");
    if (split.length > 1) {
        formattedProxies.push("http://" + split[2] + ":" + split[3] + "@" + split[0] + ":" + split[1])
    } else {
        formattedProxies.push("http://" + split[0] + ":" + split[1])
    }

}
console.log(formattedProxies)

function getProduct(url, callback){
    let options = {
        uri:url, 
        proxy: formattedProxies[Math.floor(Math.random() * formattedProxies.length)],
        followAllRedirects:true
    }
    request(options, function(err, res, body){
        try{
            //console.log(res.statusCode)
            //fs.writeFileSync('./res.html', body)
    
            if(body.includes('productlinknotfound')){
                console.error("Product not found on link: " + url);
                process.exit(1);
            }
    
            const $ = cheerio.load(body);
            let x = $('script:contains("skuJson_0")').html();
            let rawJson = x.substr(x.indexOf("skuJson_0 = ")+12);
            rawJson = rawJson.substr(0, rawJson.indexOf(';CATALOG_SDK.set'))
            let parsedJson = JSON.parse(rawJson)
            callback(parsedJson)
        }catch(e){
            callback(null)
        }
    })
}

function monitor(url){
    console.log("Starting monitor on url: " + url)
    //Initialize
    getProduct(url, function(oldProductJson){
        //fs.writeFileSync('./oldjson.json', JSON.stringify(oldProductJson))
        
        // let rawoldProductJson = fs.readFileSync('./oldjson.json');
        // let oldProductJson = JSON.parse(rawoldProductJson)
        
        setInterval(() => {
            getProduct(url, function(newProductJson){
                if(newProductJson!==null){
                    let reInit = false;

                    // let rawnewProductJson = fs.readFileSync('./newjson.json');
                    // let newProductJson = JSON.parse(rawnewProductJson)
    
                    let changes = [];
    
                    for(i in newProductJson.skus){
                        let obj = newProductJson.skus[i];
                        // Check if sku exists in old json
                        let found = false;
                        for(j in oldProductJson.skus){
                            let oldObj = oldProductJson.skus[j];
                            if(oldObj.sku==obj.sku){
                                found=true;
                                //Check if quantities increased
                                if(oldObj.availablequantity==0 && obj.availablequantity>0){
                                    //ping
                                    reInit=true;
                                    console.log("restock: " +obj.skuname)
                                    changes.push(obj.dimensions.Tamanho)
                                }
                            };
                        }
                        if(found==false){
                            //new size appeared
                            if(obj.availablequantity>0){
                                reInit=true;
                                //Ping
                                console.log("New size: " +obj.skuname)
                                changes.push(obj.dimensions.Tamanho)
                                //pingDiscord(obj);
                            }
                        }
    
                    }
                    if(reInit==true){
                        oldProductJson = newProductJson;
                        
                        pingDiscord(newProductJson, changes, url);
                        
                    }
                }else{
                    console.log("Bad request, skipping");
                }
            });
        }, interval);
    })
}

async function pingDiscord(parsedJson, changes, link){
    console.log("called")
    let imageUrl = parsedJson.skus[0].image;
    let title = parsedJson.name;
    let price = parsedJson.skus[0].bestPriceFormated;
    
    // Embed
    let embed = new Discord.MessageEmbed();
    try{embed.setTitle(title)}catch(e){};
    try{embed.setURL(link)}catch(e){};
    try{embed.setAuthor('Restock')}catch(e){};
    try{embed.setThumbnail(imageUrl)}catch(e){};
    try{embed.addField('Preço', price)}catch(e){};
    try{embed.setColor('F5761A')}catch(e){};
    try{embed.setDescription('Restocked: ' + changes.join(', '))}catch(e){};

    //Atc 
    try{
        let atcLines = [];

        for(i in parsedJson.skus){
            let obj = parsedJson.skus[i];
            if(obj.availablequantity !== 0){
                atcLines.push(`[${obj.dimensions.Tamanho} - quantidade: ${obj.availablequantity}](https://www.artwalk.com.br/checkout/cart/add?sku=${obj.sku}&qty=1&seller=1&redirect=true&sc=1)`)
            }  
        }
        if(atcLines.join('\n').length>1022){
            console.log("Using shortened link, atcLine length: " + atcLines.join('\n').length)
            let shortenedAtcLines = []
            for(i in parsedJson.skus){
                let obj = parsedJson.skus[i];
                //short url 
                
                const shortenedLink = await bitly.shorten(`https://www.artwalk.com.br/checkout/cart/add?sku=${obj.sku}&qty=1&seller=1&redirect=true&sc=1`);
                shortenedAtcLines.push(`[${obj.dimensions.Tamanho} - ${obj.availablequantity}](${shortenedLink.link})`)
            }
            embed.addField('Atc', shortenedAtcLines.join('\n'));
        }else{
            console.log("Using regular link, atcLine length: " + atcLines.join('\n').length)
            embed.addField('Atc', atcLines.join('\n'));
        }
    
        kicksByHohnWebhook.send(embed)
    }catch(e){
        kicksByHohnWebhook.send(embed)
    }
}

let rawRestockLinks = fs.readFileSync('./restock.txt', 'utf-8');

if(rawRestockLinks.split('\n').length>5){
    console.log("Cannot exceed 5 monitors!");
    process.exit(1);
}

for(i in rawRestockLinks.split('\n')){
    monitor(rawRestockLinks.split('\n')[i])
}
