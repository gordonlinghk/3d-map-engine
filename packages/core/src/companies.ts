/**
 * Real SF-area tech company data used to label procedurally generated
 * buildings in the demo (public facts; approximate valuations marked "~").
 * No logos or brand assets — text metadata only.
 */

export type CompanyCategory =
  | 'AI'
  | 'DevTools'
  | 'Fintech'
  | 'Design'
  | 'Consumer'
  | 'Enterprise'
  | 'Infra';

export type CompanyInfo = {
  id: string;
  name: string;
  category: CompanyCategory;
  description: string;
  founded: number;
  founders: string;
  funding: string;
  valuation: string;
  hq: string;
  products: string;
  unicorn: boolean;
};

export const COMPANIES: CompanyInfo[] = [
  { id: 'openai', name: 'OpenAI', category: 'AI', description: 'AI research and deployment company behind ChatGPT and the GPT models.', founded: 2015, founders: 'Sam Altman, Greg Brockman, Ilya Sutskever et al.', funding: 'Private', valuation: '~$300B', hq: 'Mission Bay', products: 'ChatGPT · GPT API · Sora', unicorn: true },
  { id: 'anthropic', name: 'Anthropic', category: 'AI', description: 'AI safety company building the Claude family of models.', founded: 2021, founders: 'Dario Amodei, Daniela Amodei', funding: 'Private', valuation: '~$183B', hq: 'SoMa', products: 'Claude · Claude Code', unicorn: true },
  { id: 'databricks', name: 'Databricks', category: 'AI', description: 'Data and AI platform unifying lakehouse analytics and ML.', founded: 2013, founders: 'Ali Ghodsi, Matei Zaharia et al.', funding: 'Private', valuation: '~$100B', hq: 'Downtown', products: 'Lakehouse · MLflow · Delta Lake', unicorn: true },
  { id: 'scale-ai', name: 'Scale AI', category: 'AI', description: 'Data engine powering AI training for enterprises and governments.', founded: 2016, founders: 'Alexandr Wang, Lucy Guo', funding: 'Private', valuation: '~$29B', hq: 'SoMa', products: 'Data Engine · Donovan', unicorn: true },
  { id: 'perplexity', name: 'Perplexity', category: 'AI', description: 'AI-powered answer engine reimagining search.', founded: 2022, founders: 'Aravind Srinivas et al.', funding: 'Private', valuation: '~$20B', hq: 'SoMa', products: 'Perplexity Search · Comet', unicorn: true },
  { id: 'elevenlabs', name: 'ElevenLabs', category: 'AI', description: 'AI voice synthesis and audio generation platform.', founded: 2022, founders: 'Mati Staniszewski, Piotr Dąbkowski', funding: 'Private', valuation: '~$6.6B', hq: 'SoMa', products: 'Voice AI · Dubbing', unicorn: true },
  { id: 'cursor', name: 'Cursor', category: 'DevTools', description: 'AI code editor built for pair-programming with frontier models.', founded: 2022, founders: 'Michael Truell, Sualeh Asif et al.', funding: 'Private', valuation: '~$29B', hq: 'SoMa', products: 'Cursor Editor', unicorn: true },
  { id: 'github', name: 'GitHub', category: 'DevTools', description: 'The home of open source and the world\'s developer platform.', founded: 2008, founders: 'Tom Preston-Werner, Chris Wanstrath et al.', funding: 'Acquired by Microsoft (2018, $7.5B)', valuation: 'Microsoft', hq: 'SoMa', products: 'GitHub · Actions · Copilot', unicorn: false },
  { id: 'vercel', name: 'Vercel', category: 'DevTools', description: 'Frontend cloud powering Next.js deployments at the edge.', founded: 2015, founders: 'Guillermo Rauch', funding: 'Private', valuation: '~$9B', hq: 'SoMa', products: 'Vercel Platform · Next.js · v0', unicorn: true },
  { id: 'stripe', name: 'Stripe', category: 'Fintech', description: 'Payments infrastructure for the internet.', founded: 2010, founders: 'Patrick Collison, John Collison', funding: 'Private', valuation: '~$91B', hq: 'South San Francisco', products: 'Payments · Billing · Connect', unicorn: true },
  { id: 'block', name: 'Block', category: 'Fintech', description: 'Financial ecosystem spanning Square, Cash App and Bitcoin tools.', founded: 2009, founders: 'Jack Dorsey, Jim McKelvey', funding: 'Public (NYSE: XYZ)', valuation: 'Public', hq: 'Mid-Market', products: 'Square · Cash App · Afterpay', unicorn: false },
  { id: 'plaid', name: 'Plaid', category: 'Fintech', description: 'Network connecting bank accounts to fintech apps.', founded: 2013, founders: 'Zach Perret, William Hockey', funding: 'Private', valuation: '~$6B', hq: 'SoMa', products: 'Auth · Transactions · Identity', unicorn: true },
  { id: 'figma', name: 'Figma', category: 'Design', description: 'Collaborative interface design tool that runs in the browser.', founded: 2012, founders: 'Dylan Field, Evan Wallace', funding: 'Public (NYSE: FIG, IPO 2025)', valuation: 'Public', hq: 'Downtown', products: 'Figma Design · FigJam · Dev Mode', unicorn: false },
  { id: 'canva', name: 'Canva', category: 'Design', description: 'Visual communication platform for everyone.', founded: 2013, founders: 'Melanie Perkins, Cliff Obrecht, Cameron Adams', funding: 'Private', valuation: '~$32B', hq: 'SoMa (US HQ)', products: 'Canva Editor · Magic Studio', unicorn: true },
  { id: 'notion', name: 'Notion', category: 'Enterprise', description: 'All-in-one connected workspace for docs, wikis and projects.', founded: 2013, founders: 'Ivan Zhao, Simon Last', funding: 'Private', valuation: '~$10B', hq: 'Mission', products: 'Notion · Notion AI · Calendar', unicorn: true },
  { id: 'cloudflare', name: 'Cloudflare', category: 'Infra', description: 'Runs ~20% of the web. Security, speed and serverless at the edge.', founded: 2009, founders: 'Matthew Prince, Michelle Zatlyn, Lee Holloway', funding: 'Public (NYSE: NET, IPO 2019)', valuation: 'Public', hq: '101 Townsend St, SoMa', products: 'CDN · Zero Trust · Workers · R2', unicorn: false },
  { id: 'airbnb', name: 'Airbnb', category: 'Consumer', description: 'Marketplace for stays and experiences around the world.', founded: 2008, founders: 'Brian Chesky, Joe Gebbia, Nathan Blecharczyk', funding: 'Public (NASDAQ: ABNB, IPO 2020)', valuation: 'Public', hq: '888 Brannan St, SoMa', products: 'Stays · Experiences', unicorn: false },
  { id: 'salesforce', name: 'Salesforce', category: 'Enterprise', description: 'The customer company — CRM, data and AI for enterprises.', founded: 1999, founders: 'Marc Benioff, Parker Harris', funding: 'Public (NYSE: CRM)', valuation: 'Public', hq: 'Salesforce Tower', products: 'CRM · Slack · Agentforce', unicorn: false },
  { id: 'uber', name: 'Uber', category: 'Consumer', description: 'Global mobility and delivery platform.', founded: 2009, founders: 'Travis Kalanick, Garrett Camp', funding: 'Public (NYSE: UBER, IPO 2019)', valuation: 'Public', hq: 'Mission Bay', products: 'Rides · Eats · Freight', unicorn: false },
  { id: 'lyft', name: 'Lyft', category: 'Consumer', description: 'Rideshare network focused on North American mobility.', founded: 2012, founders: 'Logan Green, John Zimmer', funding: 'Public (NASDAQ: LYFT, IPO 2019)', valuation: 'Public', hq: 'Potrero Hill', products: 'Rides · Bikes · Transit', unicorn: false },
  { id: 'doordash', name: 'DoorDash', category: 'Consumer', description: 'Local commerce platform for restaurant and retail delivery.', founded: 2013, founders: 'Tony Xu, Stanley Tang, Andy Fang', funding: 'Public (NASDAQ: DASH, IPO 2020)', valuation: 'Public', hq: 'SoMa', products: 'Delivery · DashPass', unicorn: false },
  { id: 'dropbox', name: 'Dropbox', category: 'Enterprise', description: 'File sync, sharing and workflow tools for distributed teams.', founded: 2007, founders: 'Drew Houston, Arash Ferdowsi', funding: 'Public (NASDAQ: DBX, IPO 2018)', valuation: 'Public', hq: 'Mission Bay', products: 'Dropbox · Dash · Sign', unicorn: false },
  { id: 'pinterest', name: 'Pinterest', category: 'Consumer', description: 'Visual discovery engine for ideas and inspiration.', founded: 2010, founders: 'Ben Silbermann, Evan Sharp, Paul Sciarra', funding: 'Public (NYSE: PINS, IPO 2019)', valuation: 'Public', hq: 'SoMa', products: 'Pinterest · Shopping', unicorn: false },
  { id: 'reddit', name: 'Reddit', category: 'Consumer', description: 'The front page of the internet — community-powered discussions.', founded: 2005, founders: 'Steve Huffman, Alexis Ohanian', funding: 'Public (NYSE: RDDT, IPO 2024)', valuation: 'Public', hq: 'Mid-Market', products: 'Reddit · Reddit Ads', unicorn: false },
  { id: 'discord', name: 'Discord', category: 'Consumer', description: 'Voice, video and text hangouts for communities and friends.', founded: 2015, founders: 'Jason Citron, Stan Vishnevskiy', funding: 'Private', valuation: '~$15B', hq: 'SoMa', products: 'Discord · Nitro', unicorn: true },
  { id: 'twitch', name: 'Twitch', category: 'Consumer', description: 'Live streaming service for games, music and creators.', founded: 2007, founders: 'Justin Kan, Emmett Shear et al.', funding: 'Acquired by Amazon (2014, ~$1B)', valuation: 'Amazon', hq: 'SoMa', products: 'Twitch · Prime Gaming', unicorn: false },
  { id: 'slack', name: 'Slack', category: 'Enterprise', description: 'Channel-based messaging platform for work.', founded: 2009, founders: 'Stewart Butterfield, Cal Henderson', funding: 'Acquired by Salesforce (2021, $27.7B)', valuation: 'Salesforce', hq: 'SoMa', products: 'Slack · Canvas · Huddles', unicorn: false },
  { id: 'instacart', name: 'Instacart', category: 'Consumer', description: 'Grocery delivery and pickup marketplace.', founded: 2012, founders: 'Apoorva Mehta et al.', funding: 'Public (NASDAQ: CART, IPO 2023)', valuation: 'Public', hq: 'Downtown', products: 'Instacart · Caper Carts', unicorn: false },
];
