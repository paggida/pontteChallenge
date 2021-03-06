const { Contract, ContractSteps, Documents, DocumentTypes, MaritalStatuses } = require('../models');
const fnc = require("../functions/contractFunctions");
const db = require("../functions/databaseFunctions");
const e = require("../Exceptions/apiExceptions");
const contractErrorTable = require("../Exceptions/contractExceptions");

module.exports = {
  async listSteps(req, res) {
    return res.json(await db.findAll(ContractSteps));
  },
  async listById(req, res) {
    const { id } = req.params;
    return res.json(await db.findById(id, Contract));
  },
  async listByCpf(req, res) {
    const { cpf } = req.params;
    return res.json(await db.findByfield(cpf,'client_cpf', Contract));
  },
  async creation(req, res) {
    const cleanBody = fnc.removeInvalidFields(req.body);
    const completeBody = fnc.addStatusNewContract(cleanBody);
    const response = (fnc.isRequiredFieldsCorrect(cleanBody))?
                      await db.insert(completeBody, Contract) :
                      e.throwAppException(1, contractErrorTable)
    return res.json(response);
  },
  async update(req, res) {
    const { id } = req.params

    const currentContract= await db.findById(id, Contract)
    const isExistingContract = !currentContract.id
    if (isExistingContract) return res.json(e.throwAppException(2, contractErrorTable))
    if(!fnc.isContractEditable(currentContract)) return res.json(e.throwAppException(4, contractErrorTable))

    const authorizedBody = fnc.removeUnauthorizedFields(req.body)
    const updateContract = fnc.removeInvalidFields(authorizedBody);

    const isUpdateMaritalStatus = !!updateContract.client_marital_status_code
    if(isUpdateMaritalStatus){
      const marital_statusObj = await db.findById(updateContract.client_marital_status_code, MaritalStatuses)
      const isExistingMaritalStatus = !!marital_statusObj.marital_status_name
      if (!isExistingMaritalStatus) return res.json(e.throwAppException(5, contractErrorTable))
    }

    await db.update(id, updateContract, Contract)
    const response = await db.findById(id, Contract)
    return res.json(response)
  },
  async uploadDocument(req, res) {
    const { id: contractId } = req.params
    const { type } = req.query

    // Validates parameter fill
    if (!contractId || !type) return res.json(e.throwAppException(1, contractErrorTable))
    const currentContract= await db.findById(contractId, Contract)
    const {id: documentTypeId} = await db.findById(type, DocumentTypes)

    const isExistingContract = !currentContract.id
    const isExistingDocumentType = !documentTypeId
    if (isExistingContract) return res.json(e.throwAppException(2, contractErrorTable))
    if (isExistingDocumentType) return res.json(e.throwAppException(3, contractErrorTable))

    if(!fnc.isContractEditable(currentContract)) return res.json(e.throwAppException(4, contractErrorTable))

    // If the contract was still at an earlier stage update it
    if(currentContract!==2){
      const updateContract = fnc.advanceToUploadStep(currentContract)
      await db.update(contractId, updateContract, Contract)
    }
    if(!req.file) return res.json(e.throwAppException(1, contractErrorTable))

    const newDocumentRecord = fnc.buildDocumentObj(req.file.filename, type, contractId)
    return res.json(await db.insert(newDocumentRecord, Documents))
  },
  async Approval(req, res) {
    const { id } = req.params
    const { approval } = req.body

    const currentContract= await db.findById(id, Contract)
    const isExistingContract = !currentContract.id
    if (isExistingContract) return res.json(e.throwAppException(2, contractErrorTable))
    if(!fnc.isContractEditable(currentContract)) return res.json(e.throwAppException(4, contractErrorTable))

    const documentsUpload = await db.findByfield(id,'contract_code', Documents);
    const IsRequiredDocumentsUpload = documentsUpload.find(({document_type_code})=> document_type_code===1)
    if(!IsRequiredDocumentsUpload) return res.json(e.throwAppException(6, contractErrorTable))

    // Set the approved status or the disapproved status
    const finalizedContract = { contract_step_code : (approval)? 3 : 4}
    await db.update(id, finalizedContract, Contract)
    const response = await db.findById(id, Contract)
    return res.json(response)
  }
};
