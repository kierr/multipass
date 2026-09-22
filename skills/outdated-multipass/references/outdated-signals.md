# Outdated Signals

High-signal patterns that indicate something belongs to a previous era.

## Code Patterns

| Era Marker | Modern Alternative |
|------------|-------------------|
| `var` declarations | `let`/`const` |
| Callback pyramids | `async`/`await` |
| `XMLHttpRequest` | `fetch` API |
| `function() { var self = this; }` | Arrow functions |
| jQuery DOM manipulation | Native DOM or framework |
| AngularJS (1.x) | Modern Angular or alternatives |
| Class components with manual bind | Hooks / function components |
| `componentWillMount` etc. | Modern lifecycle methods |
| Mixins | Composition / hooks |
| HOCs | Hooks / composition |
| `connect` from react-redux | `useSelector`/`useDispatch` |
| `_.extend` / `Object.assign` | Spread operator |
| `arguments` object | Rest parameters |
| `Array.prototype.slice.call()` | `Array.from()` |
| Manual promise chains | `async`/`await` |
| Node.js callback style | Promises / async |

## Tooling & Build

| Era Marker | Modern Alternative |
|------------|-------------------|
| Bower | npm / yarn / bun |
| Grunt / Gulp | npm scripts, Vite, esbuild |
| Browserify | Rollup, Vite, esbuild |
| Webpack 1-4 | Webpack 5+, Vite, esbuild |
| `require.js` / AMD | ES modules |
| Babel for everything | Native ES+ targeted transpilation |
| `babel-polyfill` | `core-js` with targets |
| `@babel/preset-es2015` | `@babel/preset-env` |

## Security & Crypto

| Era Marker | Why It's Dated |
|------------|----------------|
| MD5 for passwords | Broken, use bcrypt/argon2 |
| SHA1 for integrity | Collision attacks, use SHA256+ |
| DES, 3DES | Deprecated, use AES |
| RC4 | Broken |
| SSLv3, TLS 1.0, TLS 1.1 | Deprecated, use TLS 1.2+ |
| `Math.random()` for tokens | Use `crypto.getRandomValues()` |
| Custom crypto implementations | Use established libraries |

## Browser & Platform

| Era Marker | Status |
|------------|--------|
| IE-specific code | IE is dead |
| Conditional comments `<!--[if IE]>` | IE is dead |
| CSS hacks `*html`, `_height` | IE is dead |
| `-webkit-` prefixes (most) | Often unnecessary now |
| Feature detection via `userAgent` | Use feature detection |
| Polyfills for ES5 | Most browsers support ES6+ |
| Polyfills for `fetch` | 97%+ support |
| Polyfills for `Promise` | 97%+ support |

## Services & Sites

Common dead/zombie references to watch for:
- Google Code (code.google.com) - shut down
- CodePlex - shut down
- Gitorious - shut down
- GrooveShark - shut down
- Parse.com (original) - migrated
- Now.sh v1 deployments - v2 required
- Travis CI .org → .com migration
- Various domain changes and acquisitions

## Dependencies

| Signal | Meaning |
|--------|---------|
| `babel-core@6` | Babel 7+ is current |
| `request` package | Deprecated, use node-fetch/axios/got |
| `express@3` | Express 4+ required |
| `lodash@3` | Lodash 4+ is current |
| Python 2 references | Python 2 EOL 2020 |
| Node.js < 14 | LTS is 18/20+ |
| React < 16.8 | No hooks support |

## Documentation

| Signal | Action |
|--------|--------|
| Links to `/docs/v1/` | Check if v1 is still valid |
| References to "ES6" as future | ES6 is 2015, we're past it |
| "Works in Node 0.12" | Extremely dated |
| "IE8 support" | IE is dead |
| Screenshots with old UI | May indicate stale docs |
| Code samples with `var` everywhere | Likely needs refresh |
