const Component = require('react').Component
const { connect } = require('react-redux')
const h = require('react-hyperscript')
const inherits = require('util').inherits
const actions = require('../../actions')
const clone = require('clone')
const ethUtil = require('ethereumjs-util')
const BN = ethUtil.BN
const hexToBn = require('../../../../app/scripts/lib/hex-to-bn')
const {
  conversionUtil,
  addCurrencies,
  multiplyCurrencies,
} = require('../../conversion-util')
const GasFeeDisplay = require('../send/gas-fee-display-v2')
const t = require('../../../i18n')
const SenderToRecipient = require('../sender-to-recipient')
const NetworkDisplay = require('../network-display')

const { MIN_GAS_PRICE_HEX } = require('../send/send-constants')

module.exports = connect(mapStateToProps, mapDispatchToProps)(ConfirmSendEther)

function mapStateToProps (state) {
  const {
    conversionRate,
    identities,
    currentCurrency,
    send,
  } = state.metamask
  const accounts = state.metamask.accounts
  const selectedAddress = state.metamask.selectedAddress || Object.keys(accounts)[0]
  return {
    conversionRate,
    identities,
    selectedAddress,
    currentCurrency,
    send,
  }
}

function mapDispatchToProps (dispatch) {
  return {
    clearSend: () => dispatch(actions.clearSend()),
    editTransaction: txMeta => {
      const { id, txParams } = txMeta
      const {
        gas: gasLimit,
        gasPrice,
        to,
        value: amount,
      } = txParams

      dispatch(actions.updateSend({
        gasLimit,
        gasPrice,
        gasTotal: null,
        to,
        amount,
        errors: { to: null, amount: null },
        editingTransactionId: id,
      }))
      dispatch(actions.showSendPage())
    },
    cancelTransaction: ({ id }) => dispatch(actions.cancelTx({ id })),
    showCustomizeGasModal: (txMeta, sendGasLimit, sendGasPrice, sendGasTotal) => {
      const { id, txParams, lastGasPrice } = txMeta
      const { gas: txGasLimit, gasPrice: txGasPrice } = txParams

      let forceGasMin
      if (lastGasPrice) {
        forceGasMin = ethUtil.addHexPrefix(multiplyCurrencies(lastGasPrice, 1.1, {
          multiplicandBase: 16,
          multiplierBase: 10,
          toNumericBase: 'hex',
          fromDenomination: 'WEI',
        }))
      }

      dispatch(actions.updateSend({
        gasLimit: sendGasLimit || txGasLimit,
        gasPrice: sendGasPrice || txGasPrice,
        editingTransactionId: id,
        gasTotal: sendGasTotal,
        forceGasMin,
      }))
      dispatch(actions.showModal({ name: 'CUSTOMIZE_GAS' }))
    },
  }
}

inherits(ConfirmSendEther, Component)
function ConfirmSendEther () {
  Component.call(this)
  this.state = {}
  this.onSubmit = this.onSubmit.bind(this)
}

ConfirmSendEther.prototype.getAmount = function () {
  const { conversionRate, currentCurrency } = this.props
  const txMeta = this.gatherTxMeta()
  const txParams = txMeta.txParams || {}

  const FIAT = conversionUtil(txParams.value, {
    fromNumericBase: 'hex',
    toNumericBase: 'dec',
    fromCurrency: 'ETH',
    toCurrency: currentCurrency,
    numberOfDecimals: 2,
    fromDenomination: 'WEI',
    conversionRate,
  })
  const ETH = conversionUtil(txParams.value, {
    fromNumericBase: 'hex',
    toNumericBase: 'dec',
    fromCurrency: 'ETH',
    toCurrency: 'ETH',
    fromDenomination: 'WEI',
    conversionRate,
    numberOfDecimals: 6,
  })

  return {
    FIAT,
    ETH,
  }

}

ConfirmSendEther.prototype.getGasFee = function () {
  const { conversionRate, currentCurrency } = this.props
  const txMeta = this.gatherTxMeta()
  const txParams = txMeta.txParams || {}

  // Gas
  const gas = txParams.gas
  const gasBn = hexToBn(gas)

  // From latest master
//   const gasLimit = new BN(parseInt(blockGasLimit))
//   const safeGasLimitBN = this.bnMultiplyByFraction(gasLimit, 19, 20)
//   const saferGasLimitBN = this.bnMultiplyByFraction(gasLimit, 18, 20)
//   const safeGasLimit = safeGasLimitBN.toString(10)

  // Gas Price
  const gasPrice = txParams.gasPrice || MIN_GAS_PRICE_HEX
  const gasPriceBn = hexToBn(gasPrice)

  const txFeeBn = gasBn.mul(gasPriceBn)

  const FIAT = conversionUtil(txFeeBn, {
    fromNumericBase: 'BN',
    toNumericBase: 'dec',
    fromDenomination: 'WEI',
    fromCurrency: 'ETH',
    toCurrency: currentCurrency,
    numberOfDecimals: 2,
    conversionRate,
  })
  const ETH = conversionUtil(txFeeBn, {
    fromNumericBase: 'BN',
    toNumericBase: 'dec',
    fromDenomination: 'WEI',
    fromCurrency: 'ETH',
    toCurrency: 'ETH',
    numberOfDecimals: 6,
    conversionRate,
  })

  return {
    FIAT,
    ETH,
    gasFeeInHex: txFeeBn.toString(16),
  }
}

ConfirmSendEther.prototype.getData = function () {
  const { identities } = this.props
  const txMeta = this.gatherTxMeta()
  const txParams = txMeta.txParams || {}
  const { FIAT: gasFeeInFIAT, ETH: gasFeeInETH, gasFeeInHex } = this.getGasFee()
  const { FIAT: amountInFIAT, ETH: amountInETH } = this.getAmount()

  const totalInFIAT = addCurrencies(gasFeeInFIAT, amountInFIAT, {
    toNumericBase: 'dec',
    numberOfDecimals: 2,
  })
  const totalInETH = addCurrencies(gasFeeInETH, amountInETH, {
    toNumericBase: 'dec',
    numberOfDecimals: 6,
  })

  return {
    from: {
      address: txParams.from,
      name: identities[txParams.from].name,
    },
    to: {
      address: txParams.to,
      name: identities[txParams.to] ? identities[txParams.to].name : t('newRecipient'),
    },
    memo: txParams.memo || '',
    gasFeeInFIAT,
    gasFeeInETH,
    amountInFIAT,
    amountInETH,
    totalInFIAT,
    totalInETH,
    gasFeeInHex,
  }
}

ConfirmSendEther.prototype.render = function () {
  const {
    editTransaction,
    currentCurrency,
    clearSend,
    conversionRate,
    currentCurrency: convertedCurrency,
    showCustomizeGasModal,
    send: { gasTotal, gasLimit: sendGasLimit, gasPrice: sendGasPrice },
  } = this.props
  const txMeta = this.gatherTxMeta()
  const txParams = txMeta.txParams || {}

  const {
    from: {
      address: fromAddress,
      name: fromName,
    },
    to: {
      address: toAddress,
      name: toName,
    },
    memo,
    gasFeeInHex,
    amountInFIAT,
    amountInETH,
    totalInFIAT,
    totalInETH,
  } = this.getData()

  const title = txMeta.lastGasPrice ? 'Reprice Transaction' : t('confirm')
  const subtitle = txMeta.lastGasPrice
    ? 'Increase your gas fee to attempt to overwrite and speed up your transaction'
    : t('pleaseReviewTransaction')

  // This is from the latest master
  // It handles some of the errors that we are not currently handling
  // Leaving as comments fo reference

  // const balanceBn = hexToBn(balance)
  // const insufficientBalance = balanceBn.lt(maxCost)
  // const buyDisabled = insufficientBalance || !this.state.valid || !isValidAddress || this.state.submitting
  // const showRejectAll = props.unconfTxListLength > 1
//   const dangerousGasLimit = gasBn.gte(saferGasLimitBN)
//   const gasLimitSpecified = txMeta.gasLimitSpecified

  this.inputs = []

  return (
    // Main Send token Card
    h('.page-container', [
      h('.page-container__header', [
        h('.page-container__header-row', [
          h('span.page-container__back-button', {
            onClick: () => editTransaction(txMeta),
            style: {
              visibility: !txMeta.lastGasPrice ? 'initial' : 'hidden',
            },
          }, 'Edit'),
          window.METAMASK_UI_TYPE === 'notification' && h(NetworkDisplay),
        ]),
        h('.page-container__title', title),
        h('.page-container__subtitle', subtitle),
      ]),
      h('.page-container__content', [
        h(SenderToRecipient, {
          senderName: fromName,
          senderAddress: fromAddress,
          recipientName: toName,
          recipientAddress: txParams.to,
        }),

        // h('h3.flex-center.confirm-screen-sending-to-message', {
        //   style: {
        //     textAlign: 'center',
        //     fontSize: '16px',
        //   },
        // }, [
        //   `You're sending to Recipient ...${toAddress.slice(toAddress.length - 4)}`,
        // ]),

        h('h3.flex-center.confirm-screen-send-amount', [`${amountInETH}`]),
        h('h3.flex-center.confirm-screen-send-amount-currency', [ "NUKO" ]),
        h('div.flex-center.confirm-memo-wrapper', [
          h('h3.confirm-screen-send-memo', [ memo ? `"${memo}"` : '' ]),
        ]),

        h('div.confirm-screen-rows', [
          h('section.flex-row.flex-center.confirm-screen-row', [
            h('span.confirm-screen-label.confirm-screen-section-column', [ t('from') ]),
            h('div.confirm-screen-section-column', [
              h('div.confirm-screen-row-info', fromName),
              h('div.confirm-screen-row-detail', `...${fromAddress.slice(fromAddress.length - 4)}`),
            ]),
          ]),

          h('section.flex-row.flex-center.confirm-screen-row', [
            h('span.confirm-screen-label.confirm-screen-section-column', [ t('to') ]),
            h('div.confirm-screen-section-column', [
              h('div.confirm-screen-row-info', toName),
              h('div.confirm-screen-row-detail', `...${toAddress.slice(toAddress.length - 4)}`),
            ]),
          ]),

          h('section.flex-row.flex-center.confirm-screen-row', [
            h('span.confirm-screen-label.confirm-screen-section-column', [ t('gasFee') ]),
            h('div.confirm-screen-section-column', [
              h(GasFeeDisplay, {
                gasTotal: gasTotal || gasFeeInHex,
                conversionRate,
                convertedCurrency,
                onClick: () => showCustomizeGasModal(txMeta, sendGasLimit, sendGasPrice, gasTotal),
              }),
            ]),
          ]),

          h('section.flex-row.flex-center.confirm-screen-row.confirm-screen-total-box ', [
            h('div.confirm-screen-section-column', [
              h('span.confirm-screen-label', [ t('total') + ' ' ]),
              h('div.confirm-screen-total-box__subtitle', [ t('amountPlusGas') ]),
            ]),

            h('div.confirm-screen-section-column', [
              h('div.confirm-screen-row-info', `${totalInETH} NUKO`),
              h('div.confirm-screen-row-detail', `${totalInFIAT} ${currentCurrency.toUpperCase()}`),
            ]),
          ]),
        ]),

// These are latest errors handling from master
// Leaving as comments as reference when we start implementing error handling
//         h('style', `
//           .conf-buttons button {
//             margin-left: 10px;
//             text-transform: uppercase;
//           }
//         `),

//         txMeta.simulationFails ?
//           h('.error', {
//             style: {
//               marginLeft: 50,
//               fontSize: '0.9em',
//             },
//           }, 'Transaction Error. Exception thrown in contract code.')
//         : null,

//         !isValidAddress ?
//           h('.error', {
//             style: {
//               marginLeft: 50,
//               fontSize: '0.9em',
//             },
//           }, 'Recipient address is invalid. Sending this transaction will result in a loss of ETH.')
//         : null,

//         insufficientBalance ?
//           h('span.error', {
//             style: {
//               marginLeft: 50,
//               fontSize: '0.9em',
//             },
//           }, 'Insufficient balance for transaction')
//         : null,

//         // send + cancel
//         h('.flex-row.flex-space-around.conf-buttons', {
//           style: {
//             display: 'flex',
//             justifyContent: 'flex-end',
//             margin: '14px 25px',
//           },
//         }, [
//           h('button', {
//             onClick: (event) => {
//               this.resetGasFields()
//               event.preventDefault()
//             },
//           }, 'Reset'),

//           // Accept Button or Buy Button
//           insufficientBalance ? h('button.btn-green', { onClick: props.buyEth }, 'Buy Ether') :
//             h('input.confirm.btn-green', {
//               type: 'submit',
//               value: 'SUBMIT',
//               style: { marginLeft: '10px' },
//               disabled: buyDisabled,
//             }),

//           h('button.cancel.btn-red', {
//             onClick: props.cancelTransaction,
//           }, 'Reject'),
//         ]),
//         showRejectAll ? h('.flex-row.flex-space-around.conf-buttons', {
//           style: {
//             display: 'flex',
//             justifyContent: 'flex-end',
//             margin: '14px 25px',
//           },
//         }, [
//           h('button.cancel.btn-red', {
//             onClick: props.cancelAllTransactions,
//           }, 'Reject All'),
//         ]) : null,
//       ]),
//     ])
//   )
// }
      ]),

      h('form#pending-tx-form', {
        onSubmit: this.onSubmit,
      }, [
        h('.page-container__footer', [
          // Cancel Button
          h('button.btn-cancel.page-container__footer-button.allcaps', {
            onClick: (event) => {
              clearSend()
              this.cancel(event, txMeta)
            },
          }, t('cancel')),

          // Accept Button
          h('button.btn-confirm.page-container__footer-button.allcaps', [t('confirm')]),
        ]),
      ]),
    ])
  )
}

ConfirmSendEther.prototype.onSubmit = function (event) {
  event.preventDefault()
  const txMeta = this.gatherTxMeta()
  const valid = this.checkValidity()
  this.setState({ valid, submitting: true })

  if (valid && this.verifyGasParams()) {
    this.props.sendTransaction(txMeta, event)
  } else {
    this.props.dispatch(actions.displayWarning(t('invalidGasParams')))
    this.setState({ submitting: false })
  }
}

ConfirmSendEther.prototype.cancel = function (event, txMeta) {
  event.preventDefault()
  const { cancelTransaction } = this.props

  cancelTransaction(txMeta)
}

ConfirmSendEther.prototype.checkValidity = function () {
  const form = this.getFormEl()
  const valid = form.checkValidity()
  return valid
}

ConfirmSendEther.prototype.getFormEl = function () {
  const form = document.querySelector('form#pending-tx-form')
  // Stub out form for unit tests:
  if (!form) {
    return { checkValidity () { return true } }
  }
  return form
}

// After a customizable state value has been updated,
ConfirmSendEther.prototype.gatherTxMeta = function () {
  const props = this.props
  const state = this.state
  const txData = clone(state.txData) || clone(props.txData)

  const { gasPrice: sendGasPrice, gas: sendGasLimit } = props.send
  const {
    lastGasPrice,
    txParams: {
      gasPrice: txGasPrice,
      gas: txGasLimit,
    },
  } = txData

  let forceGasMin
  if (lastGasPrice) {
    forceGasMin = ethUtil.addHexPrefix(multiplyCurrencies(lastGasPrice, 1.1, {
      multiplicandBase: 16,
      multiplierBase: 10,
      toNumericBase: 'hex',
    }))
  }

  txData.txParams.gasPrice = sendGasPrice || forceGasMin || txGasPrice
  txData.txParams.gas = sendGasLimit || txGasLimit

  // log.debug(`UI has defaulted to tx meta ${JSON.stringify(txData)}`)
  return txData
}

ConfirmSendEther.prototype.verifyGasParams = function () {
  // We call this in case the gas has not been modified at all
  if (!this.state) { return true }
  return (
    this._notZeroOrEmptyString(this.state.gas) &&
    this._notZeroOrEmptyString(this.state.gasPrice)
  )
}

ConfirmSendEther.prototype._notZeroOrEmptyString = function (obj) {
  return obj !== '' && obj !== '0x0'
}

ConfirmSendEther.prototype.bnMultiplyByFraction = function (targetBN, numerator, denominator) {
  const numBN = new BN(numerator)
  const denomBN = new BN(denominator)
  return targetBN.mul(numBN).div(denomBN)
}
