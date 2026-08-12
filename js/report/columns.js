/* Project Report — 1. Column contract, matched by header name, never by index. */

export var COLS = [
  { key:"Project",                label:"Project",        type:"text",  w:118, mono:true,  filter:true },
  { key:"Remarks",                label:"Customer",       type:"text",  w:180,             filter:true },
  { key:"Purchase Order",         label:"PO",             type:"text",  w:112, mono:true,  filter:true },
  { key:"Item Number",            label:"AIT P/N",        type:"text",  w:118, mono:true,  filter:true },
  { key:"Supplier Item",          label:"Board/System",   type:"text",  w:158, mono:true,  filter:true },
  { key:"Quantity Open/Invoiced", label:"Qty",            type:"num",   w:92,  right:true, filter:false },
  { key:"Shipping Date",          label:"Shipping date",  type:"date",  w:118, right:true, filter:true },
  { key:"EXT DOLLAR PRICE",       label:"Ext. price",     type:"money", w:126, right:true, filter:false },
  { key:"General Remarks",        label:"ATRs",           type:"text",  w:200,             filter:true },
  { key:"Project Manager",        label:"Project manager",type:"text",  w:146,             filter:true },
  { key:"Done",                   label:"Done",           type:"text",  w:96,              filter:true }
];
export var SHEET_ORDER = ["Open Projects Report", "Closed Projects Report"];
export var BLANK    = "(Blank)";
export var NOT_DONE = "Not done";
export var ATR_YES  = "Mentions ATR";
export var ATR_NO   = "No ATR";
export var ROW_H = 34;
export var MAX_RANK_ROWS = 500;
export var TODAY = (function(){ var d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); })();
