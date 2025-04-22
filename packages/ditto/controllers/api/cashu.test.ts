import { Proof } from '@cashu/cashu-ts';
import { proofSchema, walletSchema } from '@ditto/cashu';
import { DittoConf } from '@ditto/conf';
import { type User } from '@ditto/mastoapi/middleware';
import { DittoApp, DittoMiddleware } from '@ditto/mastoapi/router';
import { NSchema as n, NSecSigner } from '@nostrify/nostrify';
import { genEvent } from '@nostrify/nostrify/test';
import { bytesToString, stringToBytes } from '@scure/base';
import { stub } from '@std/testing/mock';
import { assertArrayIncludes, assertEquals, assertExists, assertObjectMatch } from '@std/assert';
import { generateSecretKey, getPublicKey } from 'nostr-tools';

import cashuRoute from '@/controllers/api/cashu.ts';
import { accountFromPubkey } from '@/views/mastodon/accounts.ts';
import { createTestDB } from '@/test.ts';
import { nostrNow } from '@/utils.ts';

Deno.test('PUT /wallet must be successful', async () => {
  const mock = stub(globalThis, 'fetch', () => {
    return Promise.resolve(new Response());
  });

  await using test = await createTestRoute();

  const { route, signer, sk, relay } = test;
  const nostrPrivateKey = bytesToString('hex', sk);

  const response = await route.request('/wallet', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      mints: [
        'https://houston.mint.com',
        'https://houston.mint.com', // duplicate on purpose
        'https://cuiaba.mint.com',
      ],
      relays: [
        'wss://manager.com/relay',
      ],
    }),
  });

  assertEquals(response.status, 200);

  const pubkey = await signer.getPublicKey();

  const [wallet] = await relay.query([{ authors: [pubkey], kinds: [17375] }]);

  assertExists(wallet);
  assertEquals(wallet.kind, 17375);

  const { data, success } = walletSchema.safeParse(await response.json());

  assertEquals(success, true);
  if (!data) return; // get rid of typescript error possibly undefined

  const decryptedContent: string[][] = JSON.parse(await signer.nip44.decrypt(pubkey, wallet.content));

  const privkey = decryptedContent.find(([value]) => value === 'privkey')?.[1]!;
  const p2pk = getPublicKey(stringToBytes('hex', privkey));

  assertEquals(nostrPrivateKey !== privkey, true);

  assertEquals(data.pubkey_p2pk, p2pk);
  assertEquals(data.mints, [
    'https://houston.mint.com',
    'https://cuiaba.mint.com',
  ]);
  assertEquals(data.relays, [
    'wss://manager.com/relay',
  ]);
  assertEquals(data.balance, 0);

  const [nutzap_info] = await relay.query([{ authors: [pubkey], kinds: [10019] }]);

  assertExists(nutzap_info);
  assertEquals(nutzap_info.kind, 10019);
  assertEquals(nutzap_info.tags.length, 4);

  const nutzap_p2pk = nutzap_info.tags.find(([value]) => value === 'pubkey')?.[1]!;

  assertEquals(nutzap_p2pk, p2pk);
  assertEquals([nutzap_info.tags.find(([name]) => name === 'relay')?.[1]!], [
    'wss://manager.com/relay',
  ]);

  mock.restore();
});

Deno.test('PUT /wallet must NOT be successful: wrong request body/schema', async () => {
  const mock = stub(globalThis, 'fetch', () => {
    return Promise.resolve(new Response());
  });

  await using test = await createTestRoute();
  const { route } = test;

  const response = await route.request('/wallet', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      mints: [], // no mints should throw an error
    }),
  });

  const body = await response.json();

  assertEquals(response.status, 400);
  assertObjectMatch(body, { error: 'Bad schema' });

  mock.restore();
});

Deno.test('PUT /wallet must be successful: edit wallet', async () => {
  const mock = stub(globalThis, 'fetch', () => {
    return Promise.resolve(new Response());
  });

  await using test = await createTestRoute();
  const { route, sk, relay, signer } = test;

  const pubkey = await signer.getPublicKey();
  const privkey = bytesToString('hex', generateSecretKey());
  const p2pk = getPublicKey(stringToBytes('hex', privkey));

  // Wallet
  await relay.event(genEvent({
    kind: 17375,
    content: await signer.nip44.encrypt(
      pubkey,
      JSON.stringify([
        ['privkey', privkey],
        ['mint', 'https://mint.soul.com'],
      ]),
    ),
  }, sk));

  // Nutzap information
  await relay.event(genEvent({
    kind: 10019,
    tags: [
      ['pubkey', p2pk],
      ['mint', 'https://mint.soul.com'],
      ['relay', 'ws://localhost:4036/relay'],
    ],
  }, sk));

  const response = await route.request('/wallet', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      mints: [
        'https://new-vampire-mint.com',
        'https://new-age-mint.com',
      ],
      relays: [
        'wss://law-of-the-universe/relay',
        'wss://law-of-the-universe/relay',
      ],
    }),
  });

  const body = await response.json();

  const data = walletSchema.parse(body);

  assertEquals(response.status, 200);

  assertEquals(bytesToString('hex', sk) !== privkey, true);

  assertEquals(data.pubkey_p2pk, p2pk);
  assertEquals(data.mints, [
    'https://new-vampire-mint.com',
    'https://new-age-mint.com',
  ]);
  assertEquals(data.relays, [
    'wss://law-of-the-universe/relay',
  ]);
  assertEquals(data.balance, 0);

  const [nutzap_info] = await relay.query([{ authors: [pubkey], kinds: [10019] }]);

  assertExists(nutzap_info);
  assertEquals(nutzap_info.kind, 10019);
  assertEquals(nutzap_info.tags.length, 4);

  const nutzap_p2pk = nutzap_info.tags.find(([value]) => value === 'pubkey')?.[1]!;

  assertEquals(nutzap_p2pk, p2pk);
  assertEquals([nutzap_info.tags.find(([name]) => name === 'relay')?.[1]!], [
    'wss://law-of-the-universe/relay',
  ]);

  mock.restore();
});

Deno.test('GET /wallet must be successful', async () => {
  const mock = stub(globalThis, 'fetch', () => {
    return Promise.resolve(new Response());
  });

  await using test = await createTestRoute();
  const { route, sk, relay, signer } = test;

  const pubkey = await signer.getPublicKey();
  const privkey = bytesToString('hex', sk);
  const p2pk = getPublicKey(stringToBytes('hex', privkey));

  // Wallet
  await relay.event(genEvent({
    kind: 17375,
    content: await signer.nip44.encrypt(
      pubkey,
      JSON.stringify([
        ['privkey', privkey],
        ['mint', 'https://mint.soul.com'],
      ]),
    ),
  }, sk));

  // Nutzap information
  await relay.event(genEvent({
    kind: 10019,
    tags: [
      ['pubkey', p2pk],
      ['mint', 'https://mint.soul.com'],
      ['relay', 'ws://localhost:4036/relay'],
    ],
  }, sk));

  // Unspent proofs
  await relay.event(genEvent({
    kind: 7375,
    content: await signer.nip44.encrypt(
      pubkey,
      JSON.stringify({
        mint: 'https://mint.soul.com',
        proofs: [
          {
            id: '005c2502034d4f12',
            amount: 25,
            secret: 'z+zyxAVLRqN9lEjxuNPSyRJzEstbl69Jc1vtimvtkPg=',
            C: '0241d98a8197ef238a192d47edf191a9de78b657308937b4f7dd0aa53beae72c46',
          },
          {
            id: '005c2502034d4f12',
            amount: 25,
            secret: 'z+zyxAVLRqN9lEjxuNPSyRJzEstbl69Jc1vtimvtkPg=',
            C: '0241d98a8197ef238a192d47edf191a9de78b657308937b4f7dd0aa53beae72c46',
          },
          {
            id: '005c2502034d4f12',
            amount: 25,
            secret: 'z+zyxAVLRqN9lEjxuNPSyRJzEstbl69Jc1vtimvtkPg=',
            C: '0241d98a8197ef238a192d47edf191a9de78b657308937b4f7dd0aa53beae72c46',
          },
          {
            id: '005c2502034d4f12',
            amount: 25,
            secret: 'z+zyxAVLRqN9lEjxuNPSyRJzEstbl69Jc1vtimvtkPg=',
            C: '0241d98a8197ef238a192d47edf191a9de78b657308937b4f7dd0aa53beae72c46',
          },
        ],
        del: [],
      }),
    ),
  }, sk));

  // TODO: find a way to have a Mock mint so operations like 'swap', 'mint' and 'melt' can be tested (this will be a bit hard).
  // Nutzap
  const senderSk = generateSecretKey();

  await relay.event(genEvent({
    kind: 9321,
    content: 'Nice post!',
    tags: [
      ['p', pubkey],
      ['u', 'https://mint.soul.com'],
      [
        'proof',
        '{"amount":1,"C":"02277c66191736eb72fce9d975d08e3191f8f96afb73ab1eec37e4465683066d3f","id":"000a93d6f8a1d2c4","secret":"[\\"P2PK\\",{\\"nonce\\":\\"b00bdd0467b0090a25bdf2d2f0d45ac4e355c482c1418350f273a04fedaaee83\\",\\"data\\":\\"02eaee8939e3565e48cc62967e2fde9d8e2a4b3ec0081f29eceff5c64ef10ac1ed\\"}]"}',
      ],
    ],
  }, senderSk));

  const response = await route.request('/wallet', {
    method: 'GET',
  });

  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body, {
    pubkey_p2pk: p2pk,
    mints: ['https://mint.soul.com'],
    relays: ['ws://localhost:4036/relay'],
    balance: 100,
  });

  mock.restore();
});

Deno.test('GET /mints must be successful', async () => {
  await using test = await createTestRoute();
  const { route } = test;

  const response = await route.request('/mints', {
    method: 'GET',
  });

  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body, { mints: [] });
});

Deno.test('POST /nutzap must be successful WITH proofs to keep', async () => {
  const mock = stub(globalThis, 'fetch', (input, init) => {
    const req = new Request(input, init);

    if (req.url === 'https://cuiaba.mint.com/v1/info') {
      return Promise.resolve(
        new Response(JSON.stringify({
          'name': 'Coinos',
          'pubkey': '029c5ca5c7fb73cbae4849b3120c01c7559796e2ca9a8938ff8a3ce57790abc7e8',
          'version': 'Nutshell/0.16.3',
          'description': 'Coinos cashu mint',
          'contact': [{ 'method': 'email', 'info': 'support@coinos.io' }, {
            'method': 'twitter',
            'info': '@coinoswallet',
          }, { 'method': 'nostr', 'info': 'npub1h2qfjpnxau9k7ja9qkf50043xfpfy8j5v60xsqryef64y44puwnq28w8ch' }],
          'motd': '"Cypherpunks write code"',
          'icon_url': 'https://coinos.io/images/icon.png',
          'time': 1741964883,
          'nuts': {
            '4': { 'methods': [{ 'method': 'bolt11', 'unit': 'sat', 'description': true }], 'disabled': false },
            '5': { 'methods': [{ 'method': 'bolt11', 'unit': 'sat' }], 'disabled': false },
            '7': { 'supported': true },
            '8': { 'supported': true },
            '9': { 'supported': true },
            '10': { 'supported': true },
            '11': { 'supported': true },
            '12': { 'supported': true },
            '14': { 'supported': true },
            '15': [{ 'method': 'bolt11', 'unit': 'sat', 'mpp': true }],
            '17': {
              'supported': [{
                'method': 'bolt11',
                'unit': 'sat',
                'commands': ['bolt11_melt_quote', 'proof_state', 'bolt11_mint_quote'],
              }],
            },
          },
        })),
      );
    }

    if (req.url === 'https://cuiaba.mint.com/v1/keysets') {
      return Promise.resolve(
        new Response('{"keysets":[{"id":"004f7adf2a04356c","unit":"sat","active":true,"input_fee_ppk":0}]}'),
      );
    }

    if (req.url === 'https://cuiaba.mint.com/v1/keys/004f7adf2a04356c') {
      return Promise.resolve(
        new Response(JSON.stringify({
          'keysets': [{
            'id': '004f7adf2a04356c',
            'unit': 'sat',
            'keys': {
              '1': '02a1992d077c38c01a31b28f357b49009800940229ec2ce413ca5d89ff33df1a26',
              '2': '0348cd466e687881c79c7a6ac605f84e5baad544baa8350bbb5a39635ba59a568e',
              '4': '03d3c6e4726684b50ac19dec62f31468612134a646d586413bd659349b8fd0e661',
              '8': '02e95e207ad0b943238cf519fc901b6a7d509dd6d44e450105844462f50e3bbb18',
              '16': '03a8c412c63bc981bb5b230de73e843e8a807589ee8c394ef621dde3aac16193f2',
              '32': '036ae412daa53e9f9506ab560642121a87e9ecd90025a44f75152b3f22991b8e2e',
              '64': '029219d4e9cab24a43cf897f18cae060f02fd1c75b9147c24c0c31b8bf37a54a40',
              '128': '026e19d170fa9c2230c78b667421093740535fa7150537edab3476f127ce52e7eb',
              '256': '02f95d389782eb80055bb90e7af38dad3f15551cda6922c9a8ee92e56824ba5f44',
              '512': '03d25e2e68dc5dadd165e0f696ff5ce29f86c7657e03c50edacf33c9546a11237e',
              '1024': '02feefa2982377627edfe4706088a208c7f3a8beb87ea2975fc12413cfbea68e09',
              '2048': '03fbff7c259b9c5c9bf4d515a7a3b745548f5c4f206c6cfa462f893ec8daa354f9',
              '4096': '03e7655be00a7a085cb3540b5b6187a0b307b45f4ae0cceec2014bab535cf21cef',
              '8192': '033e6369f3f4f6d73cb43ac2105d164a1070f1e741628644e7632c0d15c2436081',
              '16384': '0300d453a54b705bba1ad3d254ca1c0ebebe5048d1a123b8001c8b85ca7907ec98',
              '32768': '037bc5683d04c024ed35d11073d7b4fd8689bef93ad47ad5ed72f2bba9f83f1b27',
              '65536': '02e96e6faae868f9b7dfbf2c0b7c92c7d0c3d70ca856884dbefd4ee353a7479649',
              '131072': '0348f6f4d1f63b3c015c128ab925101320fe9844287b24d01e061699b0e8250033',
              '262144': '021c89901fc1af82ea4dca85681de110cf8ed06027436bd54bea21abe9192d314e',
              '524288': '03a9e813b4e6a59da692088f87ce6a1a42e1fd02d0ac0c3e7a0e4e09f3948a6402',
              '1048576': '02f881f8c3b89857e221ec4f2d8c226f2e93ca86c151c74ed1e476384ccc2c5566',
              '2097152': '03863100ca06632744fd9d8b23495112c938ed7c9e12a8abb21b15e74f2adb7ff9',
              '4194304': '03295cea85458bb4c28df3f8aeaa0a786561b2cc872ccafa21f6d8820a49777895',
              '8388608': '03d0ec289a0daf37b9c0913c2d5aba3dc9b49f6d07aaa6f9ef9ffbde7a47156a6b',
              '16777216': '02a0ae8ea53dcf08184aea25c4c6dd493ef51acc439cf12a87c5cabc6668912968',
              '33554432': '020cfb68db3d8401ba26534b0aefcf75782447eae5746b08f464496b0f70500d58',
              '67108864': '03a27f513fed8ac28f388527f201e97f8c582b5770c1eaf9054bd7c6b09a3adc43',
              '134217728': '03e36aaa4fdc1b0f9ec58c10f85c099ae15809252ae35df8f3597963151d854b34',
              '268435456': '03e0f695df32b6b837f638fc1562066c33cfedd3e61dd828b9c27bd670b005e688',
              '536870912': '022a9e88be755743da48c423030962c5f9023a2252f6e982e6a6cd70c229c9a4db',
              '1073741824': '0391dffd17f79c713ecbc98ecc6673aa30ac5406dd6590650bae79df7c0735cc12',
              '2147483648': '03c2293396a135061e3a049d2a0853b275e931342d3deb024f1472b4d0436f5637',
              '4294967296': '02b8ceb6416ee9fc8b3010bb8e533939fe817235e38470b082c828fafaba1c0556',
              '8589934592': '0349912225c038acdc1d12f286db0fd2d0e64973fa34b5dd04007e82ea74273e7e',
              '17179869184': '03967e238044dd87f91949d95c851707925ca344e1947abd2a95d7861ba064c271',
              '34359738368': '03748b6da67df0726c31b8241dcadb75ce866913f4ce19da9d268fb4aeed4ced62',
              '68719476736': '023fe2cfc5c5c917b7c24b49657e11a91420a16347ab1f2fb23ba3fda2522a9a61',
              '137438953472': '03b1f3924ee292dec1ff5106983d600997b8c7c6e595868adcf1675cca17bc7126',
              '274877906944': '027a5c5fee35b5ef3d72785dd4688bb202205a209a967a8211f3a6214568e0b82c',
              '549755813888': '02cf380a20bed1720ef3d0d9fc5ae18cf3ddf644b9376a1590b3387648b74c1d52',
              '1099511627776': '02a0d1b95957c1fc8bb8772ce76ad614b586eb72f8c1838811c2efbfbc04ba557e',
              '2199023255552': '0380aeabf8f223cc46d6e3f9f80703e1afd3038bea417dcec0bf4c7676fdbc0150',
              '4398046511104': '02783814a014646f74c11510c49c3882278fa90716a68b1173a19e78e03d3db49b',
              '8796093022208': '03ad177a508b0c2c7be6c7f818c2727f6807a5a2fc5c625fad00950fb8409e2c60',
              '17592186044416': '038b40061c7b9446846a20ec2b8f7a004b907fb2200fe4c539bcb54d9bc0a8f5a4',
              '35184372088832': '02c4196bd0e749f8e3f736458f423fa2a46f1bae6c292afe9aa1a808c8cdf5e51e',
              '70368744177664': '02cb1f73960053aa1b9c41b433bf512bba0bfefbd493de0692984752cd2734c214',
              '140737488355328': '03db3ee7515421f39e434ed3f089340e0651c20458fb1c6b43569f91657490eb55',
              '281474976710656': '029ab08764876e019629a20385ef325139e8cf744cca54978efbf5fedb7930a99a',
              '562949953421312': '0294f281ed25b3b1a0f7ea13584fb5fd563cab0b499b987ca74f9a80dbd0adfa83',
              '1125899906842624': '0277810a391a74adbec086731d708d0f83900bec770120718063a60f208c9a43b5',
              '2251799813685248': '03a5e565c5d1565f8bd7a8777095ef7121c048abc549beeb9bbb93302e6f526ac2',
              '4503599627370496': '02b8af626bbdb342791f12828e68d662411f838be0cbb4f884f7bd64fce10dee2a',
              '9007199254740992': '0347f20146430bcade5996727c2e3e909124a865fe96804e700764103ea1b16f95',
              '18014398509481984': '024a816ecc2f4ec86eee15cb5011d74aa133d170a29f4230683b20fdb425ec4423',
              '36028797018963968': '03858a056912d4bbd968d13fecc33dfcdd0b8177d9d7dbd9c3cb4c30f5e9f1f11c',
              '72057594037927936': '034adf2dca33250962f1f68edbe02f4cef9cc09cdea6c969a9e83b3d2bd925e2ad',
              '144115188075855872': '02d8add57508ef351e2e5e11e50fb36ac527a71e9bc43d8c179687e26d49e17e5b',
              '288230376151711744': '024854f8bc8084e85e48c7b20de0e0028876900c7facfc3ae96b6b38f062e75671',
              '576460752303423488': '021402153d9fc728c73f9bbe1a50b305da25e7aea8792ec70b19d8103dd5040395',
              '1152921504606846976': '033bd2b0caa35a98fcdb41218b1cbdf9b392f52ee4f222d6e49b88c06485102fce',
              '2305843009213693952': '0333868e7d7f15dde6dd147854227d2ec747b5b8be210f7f4c4d6ea0c05a2d30ab',
              '4611686018427387904': '0226d990dfa39ff0ea31945d04dbe6a30f53bb76d880b810b98364c5a3fbdc90ff',
              '9223372036854775808': '02ca0c02d00b2efcfb5cd0cc404795a95620f9bc819f967c0ddbb3d457f18b6970',
            },
          }],
        })),
      );
    }

    if (req.url === 'https://cuiaba.mint.com/v1/swap') {
      return Promise.resolve(
        new Response(JSON.stringify(
          {
            'signatures': [{
              'id': '004f7adf2a04356c',
              'amount': 1,
              'C_': '0241624fa004a26c9d568284bbcbf6cc5e2f92cfd565327d58c8b2ec168db80be4',
              'dleq': {
                'e': 'c6ae7dfef601365999d99c1a5e3d85553b51b8bffade6902984b2e3953da223c',
                's': 'd2ce4c283cf3ed7ded4b61592ad71763e42e17ae7a33cb44ca05ff2b9df20f7e',
              },
            }, {
              'id': '004f7adf2a04356c',
              'amount': 4,
              'C_': '03c3afe38e8f28fd17a391768e46db47eb0e4796e6802b8f7901f2dfc4c3f55a0b',
              'dleq': {
                'e': '07a0dcbdf5a5ba9db04bc52a8e39bc4bea94b32b0d866151f11b83801959c07b',
                's': '7c809a1a71e6ae38fefd42feba2c2867ca76b282302ef7b65234c0e8ea68686b',
              },
            }, {
              'id': '004f7adf2a04356c',
              'amount': 8,
              'C_': '03e29372d0c0ba595c95fae0ad94c71ec039ce24b489e1d70e78fa4a148bf9ebac',
              'dleq': {
                'e': '152c20574fa57346204e9c9db71bb0ec0dfebd590e86f072bcb3044202fdbea4',
                's': '66803be90b934d10a7fc31e258c27511a24daf70fc6a32ecaa00769bea1ba7df',
              },
            }, {
              'id': '004f7adf2a04356c',
              'amount': 16,
              'C_': '03dfd29cca5f977b71c8fb6824ecd77f12be3ab130ac5751c56f1b3ac82fc8d079',
              'dleq': {
                'e': 'cb5e70c580c16471bc2305dc3060be0dd76ac398efe068afb17424ee794b5ce6',
                's': '1c36cf770059d76011baebdb9b85895954e3137ceddc3d14cc8a3201d1ce42e6',
              },
            }],
          },
        )),
      );
    }

    return Promise.resolve(new Response());
  });

  await using test = await createTestRoute();
  const { route, sk, relay, signer } = test;
  const pubkey = await signer.getPublicKey();

  // create sender wallet
  await route.request('/wallet', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      mints: [
        'https://cuiaba.mint.com',
      ],
    }),
  });

  // cashu proofs of sender
  const proofsOfSender = genEvent({
    kind: 7375,
    content: await signer.nip44.encrypt(
      pubkey,
      JSON.stringify({
        mint: 'https://cuiaba.mint.com',
        proofs: [
          {
            'id': '004f7adf2a04356c',
            'amount': 1,
            'secret': 'f7655502b6f60855c71f3a004c3c7e9872d2d9d2fa11457ddb99de9ce12d0d29',
            'C': '0279e4b8d89af0796120402cc466e7e5487b4e444810dfdf15e1b1f4302b209fb2',
            'dleq': {
              'e': '6e5bb14aa7dbfa88273520b4dadaa9c95b58e79b9b3148ec44df2b0bc7882272',
              's': '19f011b88b577b521c33e33bb5f6c287294474761939f7a61d188a5f16c7d2e7',
              'r': '29757f7b49859b1603a3b0d80246d71976b73c5f0db48f51c4e3c0846ce95ec7',
            },
          },
          {
            'id': '004f7adf2a04356c',
            'amount': 1,
            'secret': '5e7056406c7cf0191a7c0c9efd759328454dbac3a2adc64c7cb2393281101725',
            'C': '02d5e3aaf95e2ef02baf76174214dd2a71eb9b44edd4a43228877aa57e6a47bfa7',
            'dleq': {
              'e': 'cbd7becaf321d482d2694b3f2e4d1e4781f0443c78d7e8f984f4fe6c318167b8',
              's': 'f210869cc97b62e555a9f5252c190c70da5476e9cbece2a1295d1f95bfd89568',
              'r': '975beecbbe3cac9c3e2305003b390a63b028ae9838d1f8810b365c9f057474f1',
            },
          },
          {
            'id': '004f7adf2a04356c',
            'amount': 1,
            'secret': '3ac124d1e5b7446f9c12e97aad6db28bbada327aa3cc59a76de3b370d5f1243e',
            'C': '02e6a543ba9d4464ee28be87e74a46970b540fe9c8996b18a5919f4773f1676c72',
            'dleq': {
              'e': '86974dafb2b654199e839a946bbdab46fcb1574b6dcf70ff877f3f76470ea415',
              's': '634df2c3fedc3a73ae7b9586b1b1fe21f772dd361ecd7f7b8a9b90c869a656e6',
              'r': '685cf6e711a6129bc5021dc799dbb68191c7da1448d360a74f3622392c4e8f19',
            },
          },
          {
            'id': '004f7adf2a04356c',
            'amount': 1,
            'secret': '27a6a0560dccb118d7b9c1b103e86e42d4109c16b1eba4223aeeeb316127655e',
            'C': '037387955b2f758e504e65d612e5ec1b56688024737b030e48bbad1736bd3a8268',
            'dleq': {
              'e': 'c75c6bd0fa99f877f47ef79035935a888e704e0e78a922852693d3d5f3e9b57a',
              's': '10a200f7e2fb7df272aa95d15aa92e2328d7a9c693813f6894817bea4f7589d8',
              'r': '05a7bf2b9df7a40f578aeff1e440efcee005c84c821a3cff967c7b1ee52efade',
            },
          },
          {
            'id': '004f7adf2a04356c',
            'amount': 2,
            'secret': 'c2e66d4cc6fe86006fe4850abdfcc5533391631080b14bf0741bbdc3e0d6fdcb',
            'C': '02f8414bfaa63fd53e19bebabc742749c820e8868e0489e69694f6c65f5e184c53',
            'dleq': {
              'e': '12f9a2655edfbec33a259a1e00c14822eba72955cdf32476341c5514582e0182',
              's': 'a07c6a45eb2cb0ce5ab3c09fdfbb457a560739bdf0f79ea07755f0f5c60c2c38',
              'r': '764bd15a10ce7175b112fcd884723f1e1355e9383baa271556194389f24d2e58',
            },
          },
          {
            'id': '004f7adf2a04356c',
            'amount': 2,
            'secret': 'a31aed5251bc651429412242ce08ac7e1de8ec363c722d51ac6f9250720d5298',
            'C': '021d2c22a23118bf9a3343a85756ba9668ff2ea41cbb95002e4bbcd69ccd7e2a19',
            'dleq': {
              'e': '6db49bfe2d45b203fb7c110736719d30c2a756688eec91fefa7b9075768ca799',
              's': 'fd13e985a50491c34281fcf537f7bdaf38a0aa05f020fc5370081513ec8b6abc',
              'r': 'b602584d9349c7ce83a574cfb921e8434e2279079400ed72f1c15197dbefeb52',
            },
          },
          {
            'id': '004f7adf2a04356c',
            'amount': 2,
            'secret': '700312ccba84cb15d6a008c1d01b0dbf00025d3f2cb01f030a756553aca52de3',
            'C': '02f0ff21fdd19a547d66d9ca09df5573ad88d28e4951825130708ba53cbed19561',
            'dleq': {
              'e': '9c44a58cb429be619c474b97216009bd96ff1b7dd145b35828a14f180c03a86f',
              's': 'a11b8f616dfee5157a2c7c36da0ee181fe71b28729bee56b789e472c027ceb3b',
              'r': 'c51b9ade8cfd3939b78d509c9723f86b43b432680f55a6791e3e252b53d4b465',
            },
          },
          {
            'id': '004f7adf2a04356c',
            'amount': 2,
            'secret': '5f022ee38307d779567c86bc5bd0be8c861c157dbfd18dc2a4328286a4c73216',
            'C': '032d69930e616a2bc6f3582824b676275cc8c160167f2c5eae2d3d22c27e423aa2',
            'dleq': {
              'e': '8c7ca195d5d8930abd13f459966abebd94151cd3bd8734a2aab12e93ddd1aea4',
              's': '8b8f682e3d5dbddce2c9a32047156229aa69a73722e263468113cefa9b24606e',
              'r': 'd5b223616e620a4e8142c3026da1a7eb626add04ea774ff57f388349288e1810',
            },
          },
          {
            'id': '004f7adf2a04356c',
            'amount': 4,
            'secret': '5936f22d486734c03bd50b89aaa34be8e99f20d199bcebc09da8716890e95fb3',
            'C': '039b55f92c02243e31b04e964f2ad0bcd2ed3229e334f4c7a81037392b8411d6e7',
            'dleq': {
              'e': '7b7be700f2515f1978ca27bc1045d50b9d146bb30d1fe0c0f48827c086412b9e',
              's': 'cf44b08c7e64fd2bd9199667327b10a29b7c699b10cb7437be518203b25fe3fa',
              'r': 'ec0cf54ce2d17fae5db1c6e5e5fd5f34d7c7df18798b8d92bcb7cb005ec2f93b',
            },
          },
          {
            'id': '004f7adf2a04356c',
            'amount': 4,
            'secret': '1f46b395475b17f5594f4db198bbdfa96d7fe0f9022c85c86d03a2176f29eb37',
            'C': '0261c130affaa0013fec64f0b1a3657d94a0820de22079830a686d1bf082d4e30b',
            'dleq': {
              'e': '75d5ae01973d0261015f88c508ea2acd94391479e9218b839fa5fb14e603858a',
              's': 'd64b2119be317b901647eab693a282042784d91a4617ec12607ea2521d5e91c8',
              'r': '8664d66a5bcfe051dde67576f68137adf5594147dd58493213b209ffa82bea8a',
            },
          },
          {
            'id': '004f7adf2a04356c',
            'amount': 4,
            'secret': 'efddba6efeda171f7c07f172d78cb2c6e14c076944fe3e36bba56df263b06e1b',
            'C': '02784b1c07a64f9efca4bd65b0797562bb7ca7c48a0f0f29a101dbd5353f3e7e91',
            'dleq': {
              'e': 'a725021d01889e39fb8cee7714a9af4ac87ca545a87bba539cdd57a1fedcc780',
              's': '0cbe9dbce55f6b0e865d209920a00be1125c35e98289d91674eb7ca551c42c97',
              'r': '97037f3270c0848469df412ebec7ff0d56673f3ea0d18441f3b18e2dbaf8327c',
            },
          },
          {
            'id': '004f7adf2a04356c',
            'amount': 4,
            'secret': '6e5def60fdfdfb60b08735f364e9cb20da68b0e96594f16a66f5dd07fc0636ca',
            'C': '03379da3c4a001acf540f1e0baf52d5372357a86d00bb541bb6e7ac39f529fbbd7',
            'dleq': {
              'e': '4f008f32d26f2136a69a4aff2304e3472266bf5f1df2b69267e8281e0eb81c87',
              's': '61a24c316739408ae9062f9769f922ef3b2b685f3bd0329d4e7849de8c98f926',
              'r': '0195e7aceba8b0c256d5b2cc97aa9436931bf748fe7bead30e99e3f4e0727b9d',
            },
          },
          {
            'id': '004f7adf2a04356c',
            'amount': 8,
            'secret': 'b78e3ce8fd573c7acda19e866431c5c3099eaa14f96112c42b223b2c8a21b84d',
            'C': '039af0ec06de95d0e853236fbe9195e1afa412cb9cb2f49bf3ab492209bdfb949d',
            'dleq': {
              'e': 'e4263230d71ccb6d624d000d443595869829c5ccbce11f929ac0e89fdfb57972',
              's': 'ae3e82dd4e6e6271573dd849aa8a3841e7b84e48ead485b7c1f80cd9120ca231',
              'r': '6673c5a553c77a7aece643e9c6b7b78ecbf92cbc40427097fbdf09ebd64b7349',
            },
          },
          {
            'id': '004f7adf2a04356c',
            'amount': 8,
            'secret': '5a943d5d5c203b434f0977f5ace0ce8db4f34e4452dcceaec17e7fee6d14f60a',
            'C': '02e4361019d8c85d2ed814caf664aafc9c3e8768c10dae690879ba5d81986952ff',
            'dleq': {
              'e': '6209641b4bb455aaff06b2bf302e7392147d1b46bd70f4bcf4ba0266c5b916a9',
              's': '1ceb97a63123bd2e980fc20d009fa03f0b592aa936ac47a2ecc6df46a04c2aa9',
              'r': 'e83eee63066d1396981022fc1bf88993595478b100cdecf1a2ca3b49d67d1f86',
            },
          },
          {
            'id': '004f7adf2a04356c',
            'amount': 8,
            'secret': '0b1e0a8a2c7ea8caa861eb31bead2f345badb199dc62b895a78c87dacb117ee9',
            'C': '02ac03020b7630a59b41fa844680a5595249c34010805fcf56177235cc68446937',
            'dleq': {
              'e': 'c17d4ea7d41b8ea87fd861acb5ed5d9a5a61d67093260ed6182fa92ae71811f6',
              's': '090aa5b38bba977469a081f02b3f531146792b55e92e30d9e5d40835acad2d7c',
              'r': 'a9f63f981e2ea1e5b0fa7999dbae598ebbfeb3b9b9a2304cc938ea644b163d7c',
            },
          },
          {
            'id': '004f7adf2a04356c',
            'amount': 16,
            'secret': '503655408481c2b871cfdb0839abfbfed98ba5c196b1c63f9c2e838e12f3e984',
            'C': '02f657f8f0669ce23bb2e388f43ea1a336225a8afb7b5724c6ce572c97b40b7b3e',
            'dleq': {
              'e': '1e5f680baa7ec9e984cff7da8f09616a09cd3a09af1a7793edd6bc3e0b9b9cb4',
              's': '97b53918b42640b5818c4344ebab2332e3947727e913f8286e29540eb9273120',
              'r': 'e59e095b0347d7350376a3380d8c01ec2729f3e59c728404f23049f0b6d1e271',
            },
          },
          {
            'id': '004f7adf2a04356c',
            'amount': 16,
            'secret': '89e2315c058f3a010972dc6d546b1a2e81142614d715c28d169c6afdba5326bd',
            'C': '02bc1c3756e77563fe6c7769fc9d9bc578ea0b84bf4bf045cf31c7e2d3f3ad0818',
            'dleq': {
              'e': '8dfa000c9e2a43d35d2a0b1c7f36a96904aed35457ca308c6e7d10f334f84e72',
              's': '9270a914b1a53e32682b1277f34c5cfa931a6fab701a5dbee5855b68ddf621ab',
              'r': 'ae71e572839a3273b0141ea2f626915592b4b3f5f91b37bbeacce0d3396332c9',
            },
          },
          {
            'id': '004f7adf2a04356c',
            'amount': 16,
            'secret': '06f2209f313d92505ae5c72087263f711b7a97b1b29a71886870e672a1b180ac',
            'C': '02fa2ad933b62449e2765255d39593c48293f10b287cf7036b23570c8f01c27fae',
            'dleq': {
              'e': 'e696d61f6259ae97f8fe13a5af55d47f526eea62a7998bf888626fd1ae35e720',
              's': 'b9f1ef2a8aec0e73c1a4aaff67e28b3ca3bc4628a532113e0733643c697ed7ce',
              'r': 'b66ed62852811d14e9bf822baebfda92ba47c5c4babc4f2499d9ce81fbbbd3f2',
            },
          },
        ],
        del: [],
      }),
    ),
    created_at: nostrNow(),
  }, sk);

  await relay.event(proofsOfSender);

  const recipientSk = generateSecretKey();
  const recipientPubkey = getPublicKey(recipientSk);
  const privkey = bytesToString('hex', sk);
  const p2pk = getPublicKey(stringToBytes('hex', privkey));

  // profile of recipient
  await relay.event(genEvent({
    kind: 0,
    content: '{}',
    created_at: nostrNow(),
  }, recipientSk));

  // post of recipient that will be nutzapped
  const nutzappedPost = genEvent({
    kind: 1,
    content: 'My post',
    created_at: nostrNow(),
  }, recipientSk);

  await relay.event(nutzappedPost);

  // Recipient wallet
  await relay.event(genEvent({
    kind: 17375,
    content: await signer.nip44.encrypt(
      recipientPubkey,
      JSON.stringify([
        ['privkey', privkey],
        ['mint', 'https://mint.soul.com'],
        ['mint', 'https://cuiaba.mint.com'],
      ]),
    ),
  }, recipientSk));

  // Recipient nutzap information
  await relay.event(genEvent({
    kind: 10019,
    tags: [
      ['pubkey', p2pk],
      ['mint', 'https://mint.soul.com'],
      ['mint', 'https://cuiaba.mint.com'],
    ],
  }, recipientSk));

  const response = await route.request('/nutzap', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      account_id: recipientPubkey,
      status_id: nutzappedPost.id,
      amount: 29,
      comment: "You gon' die",
    }),
  });

  const body = await response.json();

  assertEquals(response.status, 200);

  assertEquals(body, {
    message: 'Nutzap with success!!!',
  });

  const nutzaps = await relay.query([{ kinds: [9321], authors: [pubkey] }]);

  assertEquals(nutzaps.length, 1);

  const nutzap = nutzaps[0];

  assertEquals(nutzap.pubkey, pubkey);
  assertEquals(nutzap.content, "You gon' die");
  assertArrayIncludes(nutzap.tags, [
    ['u', 'https://cuiaba.mint.com'],
    ['p', recipientPubkey],
    ['e', nutzappedPost.id, 'ws://localhost:4036/relay'],
  ]);

  const proofs = n.json().pipe(
    proofSchema,
  ).array().parse(nutzap.tags.filter(([name]) => name === 'proof').map((tag) => tag[1]).filter(Boolean));

  assertEquals(proofs.length, 4);

  const totalAmount = proofs.reduce((prev, current) => prev + current.amount, 0);

  assertEquals(totalAmount, 29);

  const [history] = await relay.query([{ kinds: [7376], authors: [pubkey] }]);

  assertExists(history);

  const historyTags = JSON.parse(await signer.nip44.decrypt(pubkey, history.content)) as string[][];

  const [newUnspentProof] = await relay.query([{ kinds: [7375], authors: [pubkey] }]);

  const newUnspentProofContent = JSON.parse(await signer.nip44.decrypt(pubkey, newUnspentProof.content)) as {
    mint: string;
    proofs: Proof[];
    del: string[];
  };

  assertEquals(newUnspentProofContent.mint, 'https://cuiaba.mint.com');
  assertEquals(newUnspentProofContent.del, [proofsOfSender.id]);

  assertEquals(historyTags, [
    ['direction', 'out'],
    ['amount', '29'],
    ['e', proofsOfSender.id, 'ws://localhost:4036/relay', 'destroyed'],
    ['e', newUnspentProof.id, 'ws://localhost:4036/relay', 'created'],
  ]);

  mock.restore();
});

Deno.test('POST /nutzap must be successful WITHOUT proofs to keep', async () => {
  const mock = stub(globalThis, 'fetch', (input, init) => {
    const req = new Request(input, init);

    if (req.url === 'https://cuiaba.mint.com/v1/info') {
      return Promise.resolve(
        new Response(JSON.stringify({
          'name': 'Coinos',
          'pubkey': '029c5ca5c7fb73cbae4849b3120c01c7559796e2ca9a8938ff8a3ce57790abc7e8',
          'version': 'Nutshell/0.16.3',
          'description': 'Coinos cashu mint',
          'contact': [{ 'method': 'email', 'info': 'support@coinos.io' }, {
            'method': 'twitter',
            'info': '@coinoswallet',
          }, { 'method': 'nostr', 'info': 'npub1h2qfjpnxau9k7ja9qkf50043xfpfy8j5v60xsqryef64y44puwnq28w8ch' }],
          'motd': '"Cypherpunks write code"',
          'icon_url': 'https://coinos.io/images/icon.png',
          'time': 1741964883,
          'nuts': {
            '4': { 'methods': [{ 'method': 'bolt11', 'unit': 'sat', 'description': true }], 'disabled': false },
            '5': { 'methods': [{ 'method': 'bolt11', 'unit': 'sat' }], 'disabled': false },
            '7': { 'supported': true },
            '8': { 'supported': true },
            '9': { 'supported': true },
            '10': { 'supported': true },
            '11': { 'supported': true },
            '12': { 'supported': true },
            '14': { 'supported': true },
            '15': [{ 'method': 'bolt11', 'unit': 'sat', 'mpp': true }],
            '17': {
              'supported': [{
                'method': 'bolt11',
                'unit': 'sat',
                'commands': ['bolt11_melt_quote', 'proof_state', 'bolt11_mint_quote'],
              }],
            },
          },
        })),
      );
    }

    if (req.url === 'https://cuiaba.mint.com/v1/keysets') {
      return Promise.resolve(
        new Response('{"keysets":[{"id":"004f7adf2a04356c","unit":"sat","active":true,"input_fee_ppk":0}]}'),
      );
    }

    if (req.url === 'https://cuiaba.mint.com/v1/keys/004f7adf2a04356c') {
      return Promise.resolve(
        new Response(JSON.stringify({
          'keysets': [{
            'id': '004f7adf2a04356c',
            'unit': 'sat',
            'keys': {
              '1': '02a1992d077c38c01a31b28f357b49009800940229ec2ce413ca5d89ff33df1a26',
              '2': '0348cd466e687881c79c7a6ac605f84e5baad544baa8350bbb5a39635ba59a568e',
              '4': '03d3c6e4726684b50ac19dec62f31468612134a646d586413bd659349b8fd0e661',
              '8': '02e95e207ad0b943238cf519fc901b6a7d509dd6d44e450105844462f50e3bbb18',
              '16': '03a8c412c63bc981bb5b230de73e843e8a807589ee8c394ef621dde3aac16193f2',
              '32': '036ae412daa53e9f9506ab560642121a87e9ecd90025a44f75152b3f22991b8e2e',
              '64': '029219d4e9cab24a43cf897f18cae060f02fd1c75b9147c24c0c31b8bf37a54a40',
              '128': '026e19d170fa9c2230c78b667421093740535fa7150537edab3476f127ce52e7eb',
              '256': '02f95d389782eb80055bb90e7af38dad3f15551cda6922c9a8ee92e56824ba5f44',
              '512': '03d25e2e68dc5dadd165e0f696ff5ce29f86c7657e03c50edacf33c9546a11237e',
              '1024': '02feefa2982377627edfe4706088a208c7f3a8beb87ea2975fc12413cfbea68e09',
              '2048': '03fbff7c259b9c5c9bf4d515a7a3b745548f5c4f206c6cfa462f893ec8daa354f9',
              '4096': '03e7655be00a7a085cb3540b5b6187a0b307b45f4ae0cceec2014bab535cf21cef',
              '8192': '033e6369f3f4f6d73cb43ac2105d164a1070f1e741628644e7632c0d15c2436081',
              '16384': '0300d453a54b705bba1ad3d254ca1c0ebebe5048d1a123b8001c8b85ca7907ec98',
              '32768': '037bc5683d04c024ed35d11073d7b4fd8689bef93ad47ad5ed72f2bba9f83f1b27',
              '65536': '02e96e6faae868f9b7dfbf2c0b7c92c7d0c3d70ca856884dbefd4ee353a7479649',
              '131072': '0348f6f4d1f63b3c015c128ab925101320fe9844287b24d01e061699b0e8250033',
              '262144': '021c89901fc1af82ea4dca85681de110cf8ed06027436bd54bea21abe9192d314e',
              '524288': '03a9e813b4e6a59da692088f87ce6a1a42e1fd02d0ac0c3e7a0e4e09f3948a6402',
              '1048576': '02f881f8c3b89857e221ec4f2d8c226f2e93ca86c151c74ed1e476384ccc2c5566',
              '2097152': '03863100ca06632744fd9d8b23495112c938ed7c9e12a8abb21b15e74f2adb7ff9',
              '4194304': '03295cea85458bb4c28df3f8aeaa0a786561b2cc872ccafa21f6d8820a49777895',
              '8388608': '03d0ec289a0daf37b9c0913c2d5aba3dc9b49f6d07aaa6f9ef9ffbde7a47156a6b',
              '16777216': '02a0ae8ea53dcf08184aea25c4c6dd493ef51acc439cf12a87c5cabc6668912968',
              '33554432': '020cfb68db3d8401ba26534b0aefcf75782447eae5746b08f464496b0f70500d58',
              '67108864': '03a27f513fed8ac28f388527f201e97f8c582b5770c1eaf9054bd7c6b09a3adc43',
              '134217728': '03e36aaa4fdc1b0f9ec58c10f85c099ae15809252ae35df8f3597963151d854b34',
              '268435456': '03e0f695df32b6b837f638fc1562066c33cfedd3e61dd828b9c27bd670b005e688',
              '536870912': '022a9e88be755743da48c423030962c5f9023a2252f6e982e6a6cd70c229c9a4db',
              '1073741824': '0391dffd17f79c713ecbc98ecc6673aa30ac5406dd6590650bae79df7c0735cc12',
              '2147483648': '03c2293396a135061e3a049d2a0853b275e931342d3deb024f1472b4d0436f5637',
              '4294967296': '02b8ceb6416ee9fc8b3010bb8e533939fe817235e38470b082c828fafaba1c0556',
              '8589934592': '0349912225c038acdc1d12f286db0fd2d0e64973fa34b5dd04007e82ea74273e7e',
              '17179869184': '03967e238044dd87f91949d95c851707925ca344e1947abd2a95d7861ba064c271',
              '34359738368': '03748b6da67df0726c31b8241dcadb75ce866913f4ce19da9d268fb4aeed4ced62',
              '68719476736': '023fe2cfc5c5c917b7c24b49657e11a91420a16347ab1f2fb23ba3fda2522a9a61',
              '137438953472': '03b1f3924ee292dec1ff5106983d600997b8c7c6e595868adcf1675cca17bc7126',
              '274877906944': '027a5c5fee35b5ef3d72785dd4688bb202205a209a967a8211f3a6214568e0b82c',
              '549755813888': '02cf380a20bed1720ef3d0d9fc5ae18cf3ddf644b9376a1590b3387648b74c1d52',
              '1099511627776': '02a0d1b95957c1fc8bb8772ce76ad614b586eb72f8c1838811c2efbfbc04ba557e',
              '2199023255552': '0380aeabf8f223cc46d6e3f9f80703e1afd3038bea417dcec0bf4c7676fdbc0150',
              '4398046511104': '02783814a014646f74c11510c49c3882278fa90716a68b1173a19e78e03d3db49b',
              '8796093022208': '03ad177a508b0c2c7be6c7f818c2727f6807a5a2fc5c625fad00950fb8409e2c60',
              '17592186044416': '038b40061c7b9446846a20ec2b8f7a004b907fb2200fe4c539bcb54d9bc0a8f5a4',
              '35184372088832': '02c4196bd0e749f8e3f736458f423fa2a46f1bae6c292afe9aa1a808c8cdf5e51e',
              '70368744177664': '02cb1f73960053aa1b9c41b433bf512bba0bfefbd493de0692984752cd2734c214',
              '140737488355328': '03db3ee7515421f39e434ed3f089340e0651c20458fb1c6b43569f91657490eb55',
              '281474976710656': '029ab08764876e019629a20385ef325139e8cf744cca54978efbf5fedb7930a99a',
              '562949953421312': '0294f281ed25b3b1a0f7ea13584fb5fd563cab0b499b987ca74f9a80dbd0adfa83',
              '1125899906842624': '0277810a391a74adbec086731d708d0f83900bec770120718063a60f208c9a43b5',
              '2251799813685248': '03a5e565c5d1565f8bd7a8777095ef7121c048abc549beeb9bbb93302e6f526ac2',
              '4503599627370496': '02b8af626bbdb342791f12828e68d662411f838be0cbb4f884f7bd64fce10dee2a',
              '9007199254740992': '0347f20146430bcade5996727c2e3e909124a865fe96804e700764103ea1b16f95',
              '18014398509481984': '024a816ecc2f4ec86eee15cb5011d74aa133d170a29f4230683b20fdb425ec4423',
              '36028797018963968': '03858a056912d4bbd968d13fecc33dfcdd0b8177d9d7dbd9c3cb4c30f5e9f1f11c',
              '72057594037927936': '034adf2dca33250962f1f68edbe02f4cef9cc09cdea6c969a9e83b3d2bd925e2ad',
              '144115188075855872': '02d8add57508ef351e2e5e11e50fb36ac527a71e9bc43d8c179687e26d49e17e5b',
              '288230376151711744': '024854f8bc8084e85e48c7b20de0e0028876900c7facfc3ae96b6b38f062e75671',
              '576460752303423488': '021402153d9fc728c73f9bbe1a50b305da25e7aea8792ec70b19d8103dd5040395',
              '1152921504606846976': '033bd2b0caa35a98fcdb41218b1cbdf9b392f52ee4f222d6e49b88c06485102fce',
              '2305843009213693952': '0333868e7d7f15dde6dd147854227d2ec747b5b8be210f7f4c4d6ea0c05a2d30ab',
              '4611686018427387904': '0226d990dfa39ff0ea31945d04dbe6a30f53bb76d880b810b98364c5a3fbdc90ff',
              '9223372036854775808': '02ca0c02d00b2efcfb5cd0cc404795a95620f9bc819f967c0ddbb3d457f18b6970',
            },
          }],
        })),
      );
    }

    if (req.url === 'https://cuiaba.mint.com/v1/swap') {
      return Promise.resolve(
        new Response(JSON.stringify(
          {
            'signatures': [{
              'id': '004f7adf2a04356c',
              'amount': 1,
              'C_': '0241624fa004a26c9d568284bbcbf6cc5e2f92cfd565327d58c8b2ec168db80be4',
              'dleq': {
                'e': 'c6ae7dfef601365999d99c1a5e3d85553b51b8bffade6902984b2e3953da223c',
                's': 'd2ce4c283cf3ed7ded4b61592ad71763e42e17ae7a33cb44ca05ff2b9df20f7e',
              },
            }, {
              'id': '004f7adf2a04356c',
              'amount': 4,
              'C_': '03c3afe38e8f28fd17a391768e46db47eb0e4796e6802b8f7901f2dfc4c3f55a0b',
              'dleq': {
                'e': '07a0dcbdf5a5ba9db04bc52a8e39bc4bea94b32b0d866151f11b83801959c07b',
                's': '7c809a1a71e6ae38fefd42feba2c2867ca76b282302ef7b65234c0e8ea68686b',
              },
            }, {
              'id': '004f7adf2a04356c',
              'amount': 8,
              'C_': '03e29372d0c0ba595c95fae0ad94c71ec039ce24b489e1d70e78fa4a148bf9ebac',
              'dleq': {
                'e': '152c20574fa57346204e9c9db71bb0ec0dfebd590e86f072bcb3044202fdbea4',
                's': '66803be90b934d10a7fc31e258c27511a24daf70fc6a32ecaa00769bea1ba7df',
              },
            }, {
              'id': '004f7adf2a04356c',
              'amount': 16,
              'C_': '03dfd29cca5f977b71c8fb6824ecd77f12be3ab130ac5751c56f1b3ac82fc8d079',
              'dleq': {
                'e': 'cb5e70c580c16471bc2305dc3060be0dd76ac398efe068afb17424ee794b5ce6',
                's': '1c36cf770059d76011baebdb9b85895954e3137ceddc3d14cc8a3201d1ce42e6',
              },
            }],
          },
        )),
      );
    }

    return Promise.resolve(new Response());
  });

  await using test = await createTestRoute();
  const { route, sk, relay, signer } = test;
  const pubkey = await signer.getPublicKey();

  // create sender wallet
  await route.request('/wallet', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      mints: [
        'https://cuiaba.mint.com',
      ],
    }),
  });

  // cashu proofs of sender
  const proofsOfSender = genEvent({
    kind: 7375,
    content: await signer.nip44.encrypt(
      pubkey,
      JSON.stringify({
        mint: 'https://cuiaba.mint.com',
        proofs: [
          {
            'id': '004f7adf2a04356c',
            'amount': 1,
            'secret': 'f7655502b6f60855c71f3a004c3c7e9872d2d9d2fa11457ddb99de9ce12d0d29',
            'C': '0279e4b8d89af0796120402cc466e7e5487b4e444810dfdf15e1b1f4302b209fb2',
            'dleq': {
              'e': '6e5bb14aa7dbfa88273520b4dadaa9c95b58e79b9b3148ec44df2b0bc7882272',
              's': '19f011b88b577b521c33e33bb5f6c287294474761939f7a61d188a5f16c7d2e7',
              'r': '29757f7b49859b1603a3b0d80246d71976b73c5f0db48f51c4e3c0846ce95ec7',
            },
          },
        ],
        del: [],
      }),
    ),
    created_at: nostrNow(),
  }, sk);

  await relay.event(proofsOfSender);

  const recipientSk = generateSecretKey();
  const recipientPubkey = getPublicKey(recipientSk);
  const privkey = bytesToString('hex', sk);
  const p2pk = getPublicKey(stringToBytes('hex', privkey));

  // profile of recipient
  await relay.event(genEvent({
    kind: 0,
    content: '{}',
    created_at: nostrNow(),
  }, recipientSk));

  // post of recipient that will be nutzapped
  const nutzappedPost = genEvent({
    kind: 1,
    content: 'My post',
    created_at: nostrNow(),
  }, recipientSk);

  await relay.event(nutzappedPost);

  // Recipient wallet
  await relay.event(genEvent({
    kind: 17375,
    content: await signer.nip44.encrypt(
      recipientPubkey,
      JSON.stringify([
        ['privkey', privkey],
        ['mint', 'https://mint.soul.com'],
        ['mint', 'https://cuiaba.mint.com'],
      ]),
    ),
  }, recipientSk));

  // Recipient nutzap information
  await relay.event(genEvent({
    kind: 10019,
    tags: [
      ['pubkey', p2pk],
      ['mint', 'https://mint.soul.com'],
      ['mint', 'https://cuiaba.mint.com'],
    ],
  }, recipientSk));

  const response = await route.request('/nutzap', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      account_id: recipientPubkey,
      status_id: nutzappedPost.id,
      amount: 1,
      comment: "You gon' die",
    }),
  });

  const body = await response.json();

  assertEquals(response.status, 200);

  assertEquals(body, {
    message: 'Nutzap with success!!!',
  });

  const nutzaps = await relay.query([{ kinds: [9321], authors: [pubkey] }]);

  assertEquals(nutzaps.length, 1);

  const nutzap = nutzaps[0];

  assertEquals(nutzap.pubkey, pubkey);
  assertEquals(nutzap.content, "You gon' die");
  assertArrayIncludes(nutzap.tags, [
    ['u', 'https://cuiaba.mint.com'],
    ['p', recipientPubkey],
    ['e', nutzappedPost.id, 'ws://localhost:4036/relay'],
  ]);

  const proofs = n.json().pipe(
    proofSchema,
  ).array().parse(nutzap.tags.filter(([name]) => name === 'proof').map((tag) => tag[1]).filter(Boolean));

  assertEquals(proofs.length, 1);

  const totalAmount = proofs.reduce((prev, current) => prev + current.amount, 0);

  assertEquals(totalAmount, 1);

  const [history] = await relay.query([{ kinds: [7376], authors: [pubkey] }]);

  assertExists(history);

  const historyTags = JSON.parse(await signer.nip44.decrypt(pubkey, history.content)) as string[][];

  const [newUnspentProof] = await relay.query([{ kinds: [7375], authors: [pubkey] }]);

  assertEquals(newUnspentProof, undefined);

  assertEquals(historyTags, [
    ['direction', 'out'],
    ['amount', '1'],
    ['e', proofsOfSender.id, 'ws://localhost:4036/relay', 'destroyed'],
  ]);

  mock.restore();
});

Deno.test('GET /statuses/:id{[0-9a-f]{64}}/nutzapped_by must be successful', async () => {
  const mock = stub(globalThis, 'fetch', () => {
    return Promise.resolve(new Response());
  });

  await using test = await createTestRoute();
  const { route, sk, relay, signer } = test;

  const pubkey = await signer.getPublicKey();

  const post = genEvent({
    kind: 1,
    content: 'Hello',
  }, sk);
  await relay.event(post);

  const senderSk = generateSecretKey();
  const sender = getPublicKey(senderSk);

  await relay.event(genEvent({
    created_at: nostrNow() - 1,
    kind: 9321,
    content: 'Who do I have?',
    tags: [
      ['e', post.id],
      ['p', pubkey],
      ['u', 'https://mint.soul.com'],
      [
        'proof',
        '{"amount":1,"C":"02277c66191736eb72fce9d975d08e3191f8f96afb73ab1eec37e4465683066d3f","id":"000a93d6f8a1d2c4","secret":"[\\"P2PK\\",{\\"nonce\\":\\"b00bdd0467b0090a25bdf2d2f0d45ac4e355c482c1418350f273a04fedaaee83\\",\\"data\\":\\"02eaee8939e3565e48cc62967e2fde9d8e2a4b3ec0081f29eceff5c64ef10ac1ed\\"}]"}',
      ],
      [
        'proof',
        '{"amount":1,"C":"02277c66191736eb72fce9d975d08e3191f8f96afb73ab1eec37e4465683066d3f","id":"000a93d6f8a1d2c4","secret":"[\\"P2PK\\",{\\"nonce\\":\\"b00bdd0467b0090a25bdf2d2f0d45ac4e355c482c1418350f273a04fedaaee83\\",\\"data\\":\\"02eaee8939e3565e48cc62967e2fde9d8e2a4b3ec0081f29eceff5c64ef10ac1ed\\"}]"}',
      ],
    ],
  }, senderSk));

  await relay.event(genEvent({
    created_at: nostrNow() - 3,
    kind: 9321,
    content: 'Want it all to end',
    tags: [
      ['e', post.id],
      ['p', pubkey],
      ['u', 'https://mint.soul.com'],
      [
        'proof',
        JSON.stringify({
          id: '005c2502034d4f12',
          amount: 25,
          secret: 'z+zyxAVLRqN9lEjxuNPSyRJzEstbl69Jc1vtimvtkPg=',
          C: '0241d98a8197ef238a192d47edf191a9de78b657308937b4f7dd0aa53beae72c46',
        }),
      ],
    ],
  }, senderSk));

  await relay.event(genEvent({
    created_at: nostrNow() - 5,
    kind: 9321,
    content: 'Evidence',
    tags: [
      ['e', post.id],
      ['p', pubkey],
      ['u', 'https://mint.soul.com'],
      [
        'proof',
        '{"amount":1,"C":"02277c66191736eb72fce9d975d08e3191f8f96afb73ab1eec37e4465683066d3f","id":"000a93d6f8a1d2c4","secret":"[\\"P2PK\\",{\\"nonce\\":\\"b00bdd0467b0090a25bdf2d2f0d45ac4e355c482c1418350f273a04fedaaee83\\",\\"data\\":\\"02eaee8939e3565e48cc62967e2fde9d8e2a4b3ec0081f29eceff5c64ef10ac1ed\\"}]"}',
      ],
    ],
  }, senderSk));

  const sender2Sk = generateSecretKey();
  const sender2 = getPublicKey(sender2Sk);

  await relay.event(genEvent({
    created_at: nostrNow() + 10,
    kind: 9321,
    content: 'Reach out',
    tags: [
      ['e', post.id],
      ['p', pubkey],
      ['u', 'https://mint.soul.com'],
      [
        'proof',
        JSON.stringify({
          id: '005c2502034d4f12',
          amount: 25,
          secret: 'z+zyxAVLRqN9lEjxuNPSyRJzEstbl69Jc1vtimvtkPg=',
          C: '0241d98a8197ef238a192d47edf191a9de78b657308937b4f7dd0aa53beae72c46',
        }),
      ],
    ],
  }, sender2Sk));

  const response = await route.request(`/statuses/${post.id}/nutzapped_by`, {
    method: 'GET',
  });

  const body = await response.json();

  assertEquals(response.status, 200);

  assertEquals(body, [
    {
      comment: 'Reach out',
      amount: 25,
      account: JSON.parse(JSON.stringify(accountFromPubkey(sender2))),
    },
    {
      comment: 'Who do I have?',
      amount: 2,
      account: JSON.parse(JSON.stringify(accountFromPubkey(sender))),
    },
    {
      comment: 'Want it all to end',
      amount: 25,
      account: JSON.parse(JSON.stringify(accountFromPubkey(sender))),
    },
    {
      comment: 'Evidence',
      amount: 1,
      account: JSON.parse(JSON.stringify(accountFromPubkey(sender))),
    },
  ]);

  mock.restore();
});

async function createTestRoute() {
  const conf = new DittoConf(
    new Map([['DITTO_NSEC', 'nsec14fg8xd04hvlznnvhaz77ms0k9kxy9yegdsgs2ar27czhh46xemuquqlv0m']]),
  );

  const db = await createTestDB();
  const relay = db.store;

  const sk = generateSecretKey();
  const signer = new NSecSigner(sk);

  const route = new DittoApp({ db: db.db, relay, conf });

  route.use(testUserMiddleware({ signer, relay }));
  route.route('/', cashuRoute);

  return {
    route,
    db,
    conf,
    sk,
    signer,
    relay,
    [Symbol.asyncDispose]: async () => {
      await db[Symbol.asyncDispose]();
    },
  };
}

function testUserMiddleware(user: User<NSecSigner>): DittoMiddleware<{ user: User<NSecSigner> }> {
  return async (c, next) => {
    c.set('user', user);
    await next();
  };
}
