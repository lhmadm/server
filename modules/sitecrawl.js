/**
 * @module jseSiteCrawl
 * @description Crawler for publisher websites
 * <h5>Exported</h5>
 * <ul>
 * <li>requestCode</li>
 * </ul>
 */

const JSE = global.JSE;

const puppeteer = require('puppeteer'); // eslint-disable-line
const fs = require('fs');
const Jimp = require('jimp');

const showcaseImageDirectory = './static/showcase/';

const jseSiteCrawl = {
	/**
	 * @method <h2>startPubCrawl</h2>
	 * @description not as much fun as it sounds
	 */
	startPubCrawl: async() => {
		const rightNow = new Date();
		const yymmdd = rightNow.toISOString().slice(2,10).replace(/-/g,""); // could be done with setInterval
		const pubSites = await JSE.jseDataIO.asyncGetVar(`adxSites/${yymmdd}/`);
		Object.keys(pubSites).forEach(async(domain) => {
			const showcaseData = await JSE.jseDataIO.asyncGetVar(`adxShowcase/${domain}/`);
			if (pubSites[domain].i > 100 && !showcaseData) { // only for sites greater than 100 impressions, that haven't been recorded yet
				const url = 'http://'+domain;
				const siteData = jseSiteCrawl.crawlPage(url);
				JSE.jseDataIO.setVariable(`adxShowcase/${domain}/`,siteData);
			} else {
				JSE.jseDataIO.setVariable(`adxShowcase/${domain}/dailyImpressions`,pubSites[domain].i * 4); // take into account this is run at six hour intervals
			}
		});
	},

	getIABKeywords: () => {
		let keywords = [];
		Object.keys(JSE.jseSiteCrawl.iabCategories).forEach((iabRef) => {
			keywords = keywords.concat(JSE.jseSiteCrawl.iabCategories[iabRef].keywords);
		});
		return keywords;
	},

	iabCategories: require('./../misc/iab-keywords.json'),
	commonWordsFile: require('./../misc/common-words.json'), // big 225kb file with all the languages
	iabKeywords: JSE.jseSiteCrawl.getIABKeywords(),

	findLanguage: (wordArray) => {
		let thisLang = 'en';
		let thisLangCount = 0;
		Object.keys(JSE.jseSiteCrawl.commonWordsFile).forEach((lang) => {
			const langWords = JSE.jseSiteCrawl.commonWordsFile[lang];
			const wordTest = wordArray.filter((word) => langWords.indexOf(word) > -1);
			if (wordTest.length > thisLangCount) {
				thisLangCount = wordTest.length;
				thisLang = lang;
			}
		});
		//console.log(`Language detected: ${thisLang}`);
		return thisLang;
	},

	/* use the innerText from the page to scan for keywords and find the category */
	iabFindCategory: (siteDataRaw) => {
		const siteData = siteDataRaw;
		const keywordArrayRaw = siteData.keywordSearch.split(/(\s|\n|,|\.|\?|!)/); // /(\s|\n|,|\.|\?|!)/
		siteData.keywordArray = keywordArrayRaw.filter(Boolean);
		siteData.keywordCount = siteData.keywordArray.length;
		siteData.language = JSE.jseSiteCrawl.findLanguage(siteData.keywordArray);
		const categorySearch = JSE.jseSiteCrawl.iabCategories;
		siteData.category = categorySearch.JSE4; // general/uncategorized
		siteData.category.count = 0;
		siteData.keywordArray.forEach((keyword,i) => {
			if (keyword && keyword.length >= 3) {
				const word = keyword.toLowerCase();
				if (JSE.jseSiteCrawl.iabKeywords.indexOf(word) > -1) {
					//console.log('Found: '+word);
					Object.keys(categorySearch).forEach((catIndex) => {
						if (categorySearch[catIndex].keywords && categorySearch[catIndex].keywords.indexOf(word) > -1) {
							categorySearch[catIndex].count = (categorySearch[catIndex].count || 0) + 1;
						}
						if (categorySearch[catIndex].count >= siteData.category.count) {
							siteData.category = categorySearch[catIndex];
						}
					});
				}
			}
		});
		return siteData;
	},

	getBestKeywords: (keywordsArray,lang) => {
		const keywordsArrayLC = keywordsArray.map((word) => word.toLowerCase());
		const uniqueKeywords = Array.from(new Set(keywordsArrayLC));
		const specificKeywords = ["supported","jsecoin","continuing","agree","donate","surplus","resources","impact","browsing","experience","privacy","webmasters","learn","visitor","wallet"];
		const commonWordsRaw = JSE.jseSiteCrawl.commonWordsFile[lang];
		const commonWords = specificKeywords.concat(commonWordsRaw);
		const cleanWords = uniqueKeywords.filter(word => {
			if (word.length < 5) return false;
			if (word.length > 12) return false;
			if (word.split(/[^a-z]/).join('') !== word) return false;
			return true;
		});
		const remove500 = cleanWords.filter(word => {
			if (commonWords.slice(0,500).indexOf(word) > -1) return false;
			return true;
		});
		if (remove500.length <= 50) return remove500;
		const remove1k = remove500.filter(word => {
			if (commonWords.slice(0,1000).indexOf(word) > -1) return false;
			return true;
		});
		if (remove1k.length <= 50) return remove1k;
		const remove5k = remove1k.filter(word => {
			if (commonWords.slice(0,5000).indexOf(word) > -1) return false;
			return true;
		});
		if (remove5k <= 50)	return remove5k;
		const remove10k = remove5k.filter(word => {
			if (commonWords.indexOf(word) > -1) return false;
			return true;
		});
		return remove10k.slice(0,50);
	},

	createThumbnail: async (original,outfile) => {
		return new Promise(resolve => {
			Jimp.read(original, (err, jimpImage) => {
				if (err) console.log('Jimp error 132: '+err);
				jimpImage
					.resize(512, 288)
					.getBase64(Jimp.AUTO, (err3, res) => {
						if (err3) console.log('Jimp error 136: '+err3);
						resolve(res);
					})
					.write(outfile);
			});
		});
	},

	createShowCase: async (desktop,mobile,outfile) => {
		return new Promise(resolve => {
			Jimp.read(showcaseImageDirectory+'/blank.png')
				.then(tpl => (
					Jimp.read(showcaseImageDirectory+'/laptop.png').then(logoTpl => {
						logoTpl.opacity(1);
						return tpl.composite(logoTpl, 5, 30, [Jimp.BLEND_DESTINATION_OVER, 0.2, 0.2]);
					})
				)
				.then(tpl2 => (Jimp.read(desktop).then(logoTpl => {
					logoTpl.opacity(1);
					return tpl2.composite(logoTpl, 148, 87, [Jimp.BLEND_DESTINATION_OVER, 0.2, 0.2]);
				})))
				.then(tpl3 => (Jimp.read(desktop).then(logoTpl => {
					logoTpl.opacity(1);
					return tpl3.composite(logoTpl, 148, 87, [Jimp.BLEND_DESTINATION_OVER, 0.2, 0.2]);
				})))
				.then(tpl4 => (Jimp.read(mobile).then(logoTpl => {
					logoTpl.opacity(1);
					return tpl4.composite(logoTpl, 1530, 395, [Jimp.BLEND_DESTINATION_OVER, 0.2, 0.2]);
				})))
				.then(tpl5 => (Jimp.read(showcaseImageDirectory+'/mobile.png').then(logoTpl => {
					logoTpl.opacity(1);
					return tpl5.composite(logoTpl, 1518, 357, [Jimp.BLEND_DESTINATION_OVER, 0.2, 0.2]);
				})))
				.then(tpl6 => (tpl6
					.getBase64(Jimp.AUTO, (err, res) => {
						resolve(res);
					})
					.write(outfile)))
				.catch(err => {
					console.error('Showcase error 175: '+err);
				}));
		});
	},

	/**
	 * @method <h2>crawlPage</h2>
	 * @description Use pupeteer headless browser to crawl the html of the url provided
	 */
	crawlPage: async(url) => {
		const browser = await puppeteer.launch({
			headless: true,
		});
		const page = await browser.newPage();
		await page.setViewport({
			width: 1280,
			height: 720,
		});
		await page.goto(url,{
			timeout: 3000000,
		}).catch(err => {
			console.error('Sitecrawl error 49: '+err);
		});
		const result = await page.evaluate(() => {
			const siteData = {};
			const h1 = document.querySelector('h1');
			if (h1) siteData.title = h1.innerText;
			const title = document.querySelector('title');
			siteData.keywordSearch += title+',';
			if (title) siteData.title = title.innerText;
			const html = document.documentElement.outerHTML;
			if (html && html.indexOf('load.jsecoin.com') > -1) {
				siteData.jsecoin = true;
			} else {
				siteData.jsecoin = false;
			}
			const meta = document.querySelectorAll('meta');
			if (meta) {
				meta.forEach((m) => {
					if (m.name === 'description') {
						siteData.description = m.content.trim();
						siteData.keywordSearch += m.content+',';
					}
					if (m.name === 'keywords') {
						siteData.keywords = m.content;
						siteData.keywordSearch += m.content+',';
					}
				});
			}
			const paragraphs = document.querySelectorAll('p');
			if (paragraphs) {
				paragraphs.forEach((p) => {
					siteData.text += p.innerText+"\n";
					siteData.keywordSearch += p.innerText+',';
				});
			}
			return siteData;
		});

		const siteData = JSE.jseSiteCrawl.iabFindCategory(result);
		siteData.bestKeywords = JSE.jseSiteCrawl.getBestKeywords(siteData.keywordArray,siteData.language);
		/*
		console.log('Keyword Array: '+siteData.keywordArray.length);
		console.log('Keyword Search: '+siteData.keywordSearch.length);
		console.log('Best Keywords: '+JSON.stringify(siteData.bestKeywords));
		console.log('Category: '+JSON.stringify(siteData.category));
		*/
		/* Get Screenshot */
		siteData.domain = url.split('https://').join('').split('http://').join('').split('/')[0].toLowerCase().split(/[^.\-a-z0-9]/).join('');
		siteData.images = {};
		siteData.images.desktop = siteData.domain+'_desktop.png';
		siteData.images.thumbnail = siteData.domain+'_thumbnail.png';
		siteData.images.showCase = siteData.domain+'_showcase.png';
		siteData.images.mobile = siteData.domain+'_mobile.png';
		await page.screenshot({ path: showcaseImageDirectory+siteData.images.desktop });
		await page.setViewport({
			width: 360,
			height: 640,
		});
		await page.screenshot({ path: showcaseImageDirectory+siteData.images.mobile });
		siteData.thumbnail = await JSE.jseSiteCrawl.createThumbnail(showcaseImageDirectory+siteData.images.desktop,showcaseImageDirectory+siteData.images.thumbnail);
		siteData.showCase = await JSE.jseSiteCrawl.createShowCase(showcaseImageDirectory+siteData.images.desktop,showcaseImageDirectory+siteData.images.mobile,showcaseImageDirectory+siteData.images.showCase);
		await browser.close();
		siteData.manualReview = false;
		siteData.ts = new Date().getTime();
		//clean up unecessary site data
		delete siteData.keywordSearch;
		delete siteData.text;
		delete siteData.keywordArray;
		delete siteData.keywordCount;
		siteData.keywords = siteData.bestKeywords;
		delete siteData.bestKeywords;
		delete siteData.category.keywords;
		return siteData;
	},
};

module.exports = jseSiteCrawl;
