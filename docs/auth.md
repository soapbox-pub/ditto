# Authentication in Ditto

One of the main benefits of Nostr is that users control their keys. Instead of a username and password, the user has a public key (`npub` or `pubkey`) and private key (`nsec`). The public key is a globally-unique identifier for the user, and the private key can be used to sign events, producing a signature that only the pubkey could have produced.

With keys, users have full control over their identity. They can move between servers freely, and post to multiple servers at once. But with such power comes great responsibilities. Users cannot lose control of their key, or they'll lose control over their account forever.

## Managing Keys

There are several ways to manage keys in Nostr, and they all come with trade-offs. It's new territory, and people are still coming up with new ideas.

The main concerns are how to **conveniently log in on multiple devices**, and **who/what to trust with your key.**

### Current Solutions

1. **Private key text.** Users copy their key between devices/apps, giving apps full control over their key. Users might email the key to themselves, or better yet use a password manager, or apps might even provide a QR code for other apps to scan. This method is convenient, but it's not secure. Keys can get compromised in transit, or by a malicious or vulnerable app.

2. **Browser extension.** For web clients, an extension can expose `getPublicKey` and `signEvent` functions to web-pages without exposing the private key directly. This option is secure, but it only works well for laptop/desktop devices. On mobile, only FireFox can do it, with no support from Safari or Chrome. It also offers no way to share a key across devices on its own.

3. **Remote signer**. Users can run a remote signer program and then connect apps to it. The signer should be running 24/7, so it's best suited for running on a server. This idea has evolved into the creation of "bunker" services. Bunkers allow users to have a traditional username and password and login from anywhere. This method solves a lot of problems, but it also creates some problems. Users have to create an account on a separate website before they can log into your website. This makes it an option for more advanced users. Also, it's concerning that the administrator of the bunker server has full control over your keys. None of this is a problem if you run your own remote signer, but it's not a mainstream option.

4. **Custodial**. Apps which make you log you in with a username/password, and then keep Nostr keys for each user in their database. You might not even be able to export your keys. This option may be easier for users at first, but it puts a whole lot of liability on the server, since leaks can cause permanent damage. It also gives up a lot of the benefits of Nostr.

Each of these ideas could be improved upon greatly with new experiments and technical progress. But to Ditto, user freedom matters the most, so we're focusing on non-custodial solution. Even though there are security risks to copying around keys, the onus is on the user. The user may fall victim to a targeted attack (or make a stupid mistake), whereas custodial servers have the ability to wipe out entire demographics of users at once. Therefore we believe that custodial solutions are actually _less_ secure than users copying around keys. Users must take precautions about which apps to trust with their private key until we improve upon the area to make it more secure (likely with better support of browser extensions, OS key management, and more).