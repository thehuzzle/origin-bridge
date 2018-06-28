import IPFS from 'ipfs'
import _ from 'lodash'
import Web3 from 'web3'

import Y from 'yjs'
import yIpfsConnector from 'y-ipfs-connector'
import yArray from 'y-array'
import yMemory from 'y-memory'
import yLevelDB from 'y-leveldb'
import yMap from 'y-map'
Y.extend(yIpfsConnector, yArray, yMemory, yLevelDB, yMap)

const GLOBAL_KEYS = "global"
const CONV_INIT_PREFIX = "convo-init-"
const CONV_PREFIX = "convo-"

const web3 = new Web3("http://127.0.0.1:8545/")

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

function verifyMessageSignature(o, content_object) {
  if (content_object.msg.includes(content_object.address))
  {
    let verify_address = web3.eth.accounts.recover(content_object.msg, content_object.sig)
    if (verify_address == o.parentSub)
    {
      console.log("Key Verified: ", content_object.msg, " Signature: ", content_object.sig,  " Signed with: ", verify_address)
      return true
    }
  }
  return false
}

function insertVerifier(verifyFunction) {
  return (peer, message, signature, callback) => {
    message = JSON.parse(message)
    //console.log("verify peer:", peer, " message:", message, " signature:", signature)

    if (message.deleteSet && !_.isEmpty(message.deleteSet))
    {
      //no deletes allowed
      callback(0, false)
      return
    }
    //console.log("looking at messages os.")
    if (message.os || message.ops)
    {
      let ops = message.os || message.ops
      for (let o of ops)
      {
        if(o.struct == 'Insert')
        {
          for (let object of o.content)
          {

            //console.log("calling verify on:", object)
            if (!verifyFunction(o, object))
            {
              callback(0, false)
              return
            }

          }
        }
        else
        {
          callback(0, false)
          return
        }
      }
      callback(0, true)
    }
    else
    {
      // pass through for now
      callback(0, true)
    }
  }
}

let ipfs = new IPFS({
      repo: './ipfs-repo',
      EXPERIMENTAL: {
        pubsub: true,
        /*relay: {
          enabled: true, // enable relay dialer/listener (STOP)
          hop: {
            enabled: true // make this node a relay (HOP)
          }
        }*/
      },
      config: {
        Addresses: {
          Swarm: [
            '/ip4/0.0.0.0/tcp/9012/ws',
            '/dns4/ws-star.discovery.libp2p.io/tcp/443/wss/p2p-websocket-star'
          ]
        }
      }
    })

function startIpfsY(room_id, verifyFunc, shareObj){
  return Y(
      {
        db: {
          name: 'leveldb',
          dir: './db',
          cleanStart: true    // this needs to be true on release
        },
        connector: {
          name: 'ipfs', // use the IPFS connector
          ipfs: ipfs, // inject the IPFS object
          room: room_id,
          verifySignature: verifyFunc
        },
        sourceDir: '/node_modules',
        share:shareObj
      }
    )
}

let shareYMap = {}

function startShareY(room_id, verifyFunc, shareObj, share_func) {
  if(!shareYMap[room_id])
  {
    startIpfsY(room_id, verifyFunc, shareObj).then( y => {
      if (share_func){
        share_func(y)
      }
      shareYMap[room_id] = y
    })
  }
}

function joinConversationKey(converser1, converser2)
{
  let keys = [converser1, converser2]
  keys.sort()

  return keys.join('-')

}

function onConverse(conversee){
  return y => {
    y.share.conversers.observe(event => {
      console.log("started conversation between:", event.name, " and ", conversee)
      startShareY( CONV_PREFIX + joinConversationKey(conversee, event.name), insertVerifier(verifyConvMsg(conversee, event.name)), {conversation:'Array'})
    })
  }
}



ipfs.on('ready', () => {
    startIpfsY(GLOBAL_KEYS, insertVerifier(verifyMessageSignature), { ethMessagingKeys:'Map' })
    .then (
    ).then(y => {
      console.log("Yjs node started")
      y.share.ethMessagingKeys.observe(event => {
        if (event.type == "add" || event.type == "update")
        {
          console.log("started conversation for:", event.name)
          startShareY( CONV_INIT_PREFIX + event.name, insertVerifier(verifyConversers(event.name, y.share.ethMessagingKeys)), {conversers:'Map'}, onConverse(event.name))
        }
      })
    })
})

