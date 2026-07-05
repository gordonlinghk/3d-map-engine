/**
 * Real SF-area tech company data used to label procedurally generated
 * buildings in the demo (public facts; approximate valuations marked "~").
 * No logos or brand assets — text metadata only.
 */
export type CompanyCategory = 'AI' | 'DevTools' | 'Fintech' | 'Design' | 'Consumer' | 'Enterprise' | 'Infra';
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
export declare const COMPANIES: CompanyInfo[];
