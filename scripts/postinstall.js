#!/usr/bin/env node

/**
 * GSD Postinstall
 *
 * Thin wrapper that delegates to install.js in postinstall mode
 * (workspace linking + deps only, no global/local npm install).
 */

process.env.npm_lifecycle_event = process.env.npm_lifecycle_event || 'postinstall'
// #region agent log
fetch('http://127.0.0.1:7747/ingest/93b5b814-87f1-410d-aca8-f5619ce3c0c6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'fe5872'},body:JSON.stringify({sessionId:'fe5872',location:'scripts/postinstall.js:11',message:'postinstall.js entry - about to dynamic-import install.js',data:{cwd:process.cwd(),execPath:process.execPath,lifecycle:process.env.npm_lifecycle_event},timestamp:Date.now(),hypothesisId:'H-D'})}).catch(()=>{});
// #endregion
import('./install.js')
