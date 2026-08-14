# `mpb`, a Mindustry bot.
As of current writing, this repository acts as place to see how this works, however, most of the code does not (yet) do stuff (AKA, most of [Packets.ts](src/backend/Packets.ts)) or is very broken (Like movement), so if your trying to make something like this, ~~don't, use Java so you can use the source code, please~~ you can use this as a starting point, but I would try to redo some of the stuff as even I'm still having issues figuring out how this works.

## What is `node-mindustry-main`?
The `node-mindustry-main` folder is the original code this project was based off of on [GitHub](https://github.com/squi2rel/node-mindustry/tree/main#). It was arcived a while ago before I started this project, which meant that my orginal plans are going to take a whole lot longer, and now I would be extreamly happy if I can get `mpb` to work mostly at all....

## Some things that work:
* Connecting to a server and holding that connection.
* Resieving and sending chat messages.
* Pinging locations on the map, optionally with added text on the ping.
* Setting some states about `mpb`'s player unit, like if it is chatting, shooting, it's pointer position, ect.
* Respawning the player unit.

## Some thing that *don't* work:
* Movement, `mpb` can't move by itself, *but* can be push around by other units
* Loading the map, that is a WIP, I have not finished reworking that.
* Sensing units, even itself, which *may* be cause for movement to not work, although it may just be `mpb`'s postion it not being sent correctly, IDK.
* Know the name of players, but that is not important in `mpb`'s current state.

Things that are not listed were either forgotten, or I do not know the state of that feature.

Also, I'm likely not going to update this repository very often as new features/capibilities of `mpb` are going to be slow.

Other than that, things will change and we will see what happens with `mpb`. You will find me sometimes testing `mpb` in the Fish Sandbox server for live tests or just messing around, however most development will be offline on a localy hosted server.

---

Note: If you **really** want to run `mpb` on a public server, at least change the UUID so other's don't think it is me runninh `mpb` as I don't want to private or delete this repository because someone wanted to do something really dumb, but I will very much do so if I have to. **Listen to admins!**