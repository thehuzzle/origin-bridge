import ipfsAPI from 'ipfs-api'
import _ from 'lodash'
import Web3 from 'web3'

import OrbitDB from 'orbit-db'
import Keystore from 'orbit-db-keystore'

const GLOBAL_KEYS = "global"
const CONV_INIT_PREFIX = "convo-init-"
const CONV = "conv"

const web3 = new Web3("http://127.0.0.1:8545/")

class InsertOnlyKeystore {
  constructor(verifier, post_verify) {
    this._verifier = verifier
    this._post_verify = post_verify
  }

  setPostVerify(postFunc) {
    this._post_verify = postFunc
  }

  createKey(id) {
    return ""
  }

  getKey(id) {
    //for some reason Orbit requires a key for verify to be triggered
    return {
      getPublic:(type) => "-"
    }
  }

  async importPublicKey(key) {
    return key
  }

  verify(signature, key, data) {
    try{
      let message = JSON.parse(data.toString('utf8'))
      console.log("we got a message to verify:", message, " sig:", signature)
      if (message.payload.op == "PUT" || message.payload.op == "ADD")
      {
          if(this._verifier(signature, key, message, data))
          {
            if (this._post_verify){
              this._post_verify(message)
            }
            return Promise.resolve(true)
          }
      }
    } catch(error)
    {
      console.log(error)
    }
    return Promise.reject(false)
  }
}

function verifyRegistrySignature(signature, key, message) {
  let value = message.payload.value
  let set_key = message.payload.key
  //console.log("Verify Registry:", message, " key: ", key, " sig: ", signature)
  let verify_address = web3.eth.accounts.recover(value.msg, signature)
  //console.log("Verify address:", verify_address)
  if (verify_address == set_key && value.msg.includes(value.address))
  {
    let extracted_address = "0x" + web3.utils.sha3(value.pub_key).substr(-40)
    //console.log("extracted address is:", extracted_address)
    if (extracted_address == value.address.toLowerCase())
    {
      console.log("Key Verified: ", value.msg, " Signature: ", signature,  " Signed with: ", verify_address)
      return true
    }
  }
  console.log("Verify failed...")
  return false
}

function verifyMessageSignature(keys_map)
{
  return (signature, key, message, buffer) => {
    console.log("Verify Message:", message, " key: ", key, " sig: ", signature)
    let verify_address = web3.eth.accounts.recover(buffer.toString("utf8"), signature)
    let entry = keys_map.get(key)
    //only two addresses should have write access to here
    if (entry.address == verify_address)
    {
      return true
    }
    return false
  }
}


function verifyConversationSignature(keys_map)
{
  return (signature, key, message, buffer) => {
    console.log("Verifying:", buffer,  " signature: ", signature)
    let verify_address = web3.eth.accounts.recover(buffer.toString("utf8"), signature)
    let eth_address = message.id.substr(-42) //hopefully the last 42 is the eth address
    console.log("Verify Conversation:", message, " key: ", key, " sig: ", signature, " eth address: ", eth_address)
    if(key == message.payload.key || key == eth_address) //only one of the two conversers can set this parameter
    {
      let entry = keys_map.get(key)
      console.log("checking ", entry.address, " against: ", verify_address)
      if (entry.address == verify_address)
      {
        return true
      }
    }
    return false
  }
}


function verifyConvMsg(converser1, converser2){
  return (o, content_object) => {
    /*
    let verify_address = web3.eth.accounts.recover(JSON.stringify(content_obj.msg), content_object.sig)

    if (verify_address == converser1 || verify_address == converser2)
    {
    */
    console.log("Verified conv msg for: ", content_object)
    return true
    //}
  }
}


function verifyConversers(conversee, keys_map){
  return (o, content_object) => {
    let check_string = joinConversationKey(conversee, o.parentSub) + content_object.ts.toString()
    //console.log("check_string:", check_string)
    //console.log("verify conv o:", o)
    //console.log("converser:", content_object)

    let verify_address = web3.eth.accounts.recover(check_string, content_object.sig)

    //console.log("converser recover address:", verify_address)

    let parent_key = keys_map.get(o.parentSub)
    let conversee_key = keys_map.get(conversee)

    if ((parent_key && verify_address == parent_key.address) || (conversee_key && verify_address == keys_map.get(conversee).address))
    {
      console.log("Verified conv init for: ", conversee, " Signature: ", content_object.sig,  " Signed with: ", verify_address)
      return true
    }
    return false
  }
}

let ipfs = ipfsAPI("/ip4/127.0.0.1/tcp/5002")
process.env.LOG = "DEBUG"

//the OrbitDB should be the message one
let messagingRoomsMap = {}

async function startRoom(room_db, room_id, store_type, writers, share_func) {
  let key = room_id
  if (writers.length != 1 || writers[0] != "*")
  {
    key = room_id + "-" +  writers.join("-")
  }
  console.log("checking key:", key)
  if(!messagingRoomsMap[key])
  {
    messagingRoomsMap[key] = "pending"
    let room = await room_db[store_type](room_id, {write:writers})
    console.log("Room started:", room.id)
    if (share_func){
      share_func(room)
    }
    messagingRoomsMap[key] = room
    rebroadcastOnReplicate(room_db, room)
    //for persistence replace drop with below
    room.load()
  }
}

function joinConversationKey(converser1, converser2)
{
  let keys = [converser1, converser2]
  keys.sort()

  return keys.join('-')
}

function onConverse(room_db, conversee, payload){
    let converser = payload.key
    console.log("started conversation between:", converser, " and ", conversee)
    let writers = [converser, conversee].sort()
    startRoom(room_db, CONV, "eventlog", writers)
}

function handleGlobalRegistryWrite(conv_init_db, payload) {
  console.log("We see an entry:", payload)
  if (payload.op == "PUT")
  {
    let eth_address = payload.key
    console.log("started conversation for:", eth_address)
    startRoom(conv_init_db, CONV_INIT_PREFIX + eth_address, 'kvstore', ['*'])
  }
}

function rebroadcastOnReplicate(DB, db){
  db.events.on('replicated', (dbname) => {
    console.log("rebroadcasting heads for ", db.id, "...")
    //rebroadcast
    DB._pubsub.publish(db.id,  db._oplog.heads)
  })
}

ipfs.id().then(async (peer_id) => {
    let orbit_global = new OrbitDB(ipfs, "odb/globalNames", {keystore:new InsertOnlyKeystore(verifyRegistrySignature)})
    let global_registry = await orbit_global.kvstore(GLOBAL_KEYS, { write: ['*'] })
    rebroadcastOnReplicate(orbit_global, global_registry)

    console.log("Oribt registry started...:", global_registry.id)

    let conv_init_db = new OrbitDB(ipfs, "odb/conv_init", {keystore:new InsertOnlyKeystore(verifyConversationSignature(global_registry))})
    let conv_db = new OrbitDB(ipfs, "odb/convs", {keystore:new InsertOnlyKeystore(verifyMessageSignature(global_registry))})

    orbit_global.keystore.setPostVerify(message => {
        handleGlobalRegistryWrite(conv_init_db, message.payload)
    })

    conv_init_db.keystore.setPostVerify( message => {
      let eth_address = message.id.substr(-42) //hopefully the last 42 is the eth address
      onConverse(conv_db, eth_address, message.payload)
    })

      
    /*global_registry.events.on('write', (dbname, hash, entry) => {
      handleGlobalRegistryWrite(conv_db, entry.payload)
    })*/

    global_registry.events.on('ready', (address) => 
      {
        console.log("ready...", global_registry.all())
      })


    // testing it's best to drop this for now
    //global_registry.drop()
    global_registry.load()
})

