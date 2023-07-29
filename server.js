const express = require('express');
const knex = require('knex');
require('dotenv').config();
const app = express();
app.use(express.json());


// Initialize the knex instance
const knexInstance = knex({
  client: 'mysql2',
  connection: {
    host: process.env.MYSQL_HOST || 'db',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'Bitespeed_Contacts',
  },
  migrations: {
    directory: './migrations',
  },
  seeds: {
    directory: './db/seeds',
  },
});

// Function to run migrations
async function runMigrations() {
  try {
    await knexInstance.migrate.latest();
    console.log('Migrations ran successfully.');
  } catch (error) {
    console.error('Error running migrations:', error);
  }
}


const identifyContact = async (req, res) => {
  
  const { email, phoneNumber } = req.body;

  let query;
  let bindings;
  let results;
  let filteredResult;
  let responsePayload;
  let primaryContact;
  let secondaryContacts;

  if (!email && !phoneNumber) {
    return res.status(400).json({ error: 'Invalid input. Both email and phoneNumber cannot be null.' });
  }


  if((!phoneNumber || !email)){

      query = `SELECT c1.* FROM contacts c1
               LEFT JOIN contacts c2 ON c1.id = c2.linkedId OR c1.linkedId = c2.id  
               WHERE c1.email = ? OR c1.phoneNumber = ? OR c2.email = ? OR c2.phoneNumber = ?`;
    
       bindings = [email, phoneNumber, email, phoneNumber];
       [results] = await knexInstance.raw(query, bindings);

      if(results.length == 0){
        return res.status(400).json({ error: 'Invalid data. User not found!' });
      }
      

             primaryContact = results.find((contact) => contact.linkPrecedence === 'primary');
             secondaryContacts = results.filter(
                  (contact) => contact.linkPrecedence === 'secondary'
                );
        
                if(email == primaryContact.email){
                  responsePayload = {
                   contact: {
                     primaryContactId: primaryContact.id,
                     emails: [...new Set([primaryContact?.email].filter(Boolean))],
                     phoneNumbers: results.map((contact) => contact.phoneNumber).filter(Boolean),
                     secondaryContactIds: secondaryContacts
                       .map((contact) => contact.id),
                   },
                 };
               }else{
                  responsePayload = {
                   contact: {
                     primaryContactId: primaryContact.id,
                     emails: results.map((contact) => contact.email).filter(Boolean),
                     phoneNumbers:[...new Set([primaryContact?.phoneNumber].filter(Boolean))],
                     secondaryContactIds: secondaryContacts
                       .map((contact) => contact.id),
                   },
                 };
               }

                return res.status(200).json(responsePayload);


    } else {
      query = `SELECT c1.* FROM contacts c1
               LEFT JOIN contacts c2 ON c1.id = c2.linkedId OR c1.linkedId = c2.id`;
       bindings = [];
      [results] = await knexInstance.raw(query, bindings);

      try {

         //check for contact with this email and phone number and if it doesnot exist create a primary contact 

        filteredResult = results.filter(
          (contact) => contact.email === email || contact.phoneNumber === phoneNumber
        );

        if(filteredResult.length === 0){
          // If no contacts are found, create a new primary contact
            responsePayload = await createPrimaryContact(email, phoneNumber)
            return res.status(200).json(responsePayload);
        }  

        
                // Identify the primary contact and secondary contacts
                primaryContact = results.filter((contact) => contact.linkPrecedence === 'primary');
                secondaryContacts = results.filter(
                  (contact) => contact.linkPrecedence === 'secondary'
                );


                // Function to check if a secondary contact with the given email and phone already exists
                const isSecondaryContactExist = (email, phoneNumber) => {
                  return secondaryContacts.some(
                    (contact) => contact.email === email && contact.phoneNumber === phoneNumber
                  );
                };

                const isPrimaryContactExist = (email, phoneNumber) => {
                  return primaryContact.some(
                    (contact) => contact.email === email && contact.phoneNumber === phoneNumber
                  );
                }

                if(isSecondaryContactExist(email, phoneNumber)){
                  
                   responsePayload = await getUserContacts(email, phoneNumber);
                   return res.status(200).json(responsePayload);

                }

                if(isPrimaryContactExist(email, phoneNumber)){

                   responsePayload = await getUserContacts(email, phoneNumber);
                   return res.status(200).json(responsePayload);
                }


               
                
       

          //convert a contact as secondary if request has phoneNumber of one contact and email of other contact

          const findPrimaryContactByPhoneOrEmail = (filteredResult, email, phoneNumber) => {
            return filteredResult.find(
              (contact) => (contact.email === email || contact.phoneNumber === phoneNumber) && contact.linkPrecedence === 'primary'
            );
          };

                   const primaryContactWithEmail = findPrimaryContactByPhoneOrEmail(filteredResult, email, null);
                   const primaryContactWithPhone = findPrimaryContactByPhoneOrEmail(filteredResult, null, phoneNumber);

                  if (primaryContactWithEmail && primaryContactWithPhone && primaryContactWithEmail.id !== primaryContactWithPhone.id) {
                  // Two different primary contacts found with the provided email and phone

                  // Identify the older primary contact among the two
                  const olderPrimaryContact =
                    Date.parse(primaryContactWithEmail.createdAt) < Date.parse(primaryContactWithPhone.createdAt)
                      ? primaryContactWithEmail
                      : primaryContactWithPhone;

                  // Identify the later created primary contact among the two
                  const laterPrimaryContact = olderPrimaryContact === primaryContactWithEmail ? primaryContactWithPhone : primaryContactWithEmail;

                  // Make the later created primary contact as secondary and link it to the older primary contact
                  const responsePayload = await makeContactSecondary(olderPrimaryContact, laterPrimaryContact);

                  return res.status(200).json(responsePayload);
                }


              //create secondary contact if request has email or phoneNo of a primary contact
                for (const contact of primaryContact) {
                  if (contact.email === email || contact.phoneNumber === phoneNumber) {
                    if (!isSecondaryContactExist(email, phoneNumber)) {
                      const responsePayload = await createSecondaryContact(contact, email, phoneNumber);
                      return res.status(200).json(responsePayload);
                    }
                  }
                }

      } catch (error) {
         console.error(error);
         return res.status(500).json({ error: 'Internal Server Error' });
        }
      
  }
    
};




const createPrimaryContact =  async(email, phoneNumber) => {

  const { insertId } = await knexInstance.raw(
    'INSERT INTO contacts (phoneNumber, email, linkPrecedence) VALUES (?, ?, "primary")',
    [phoneNumber, email]
  );

const responsePayload = {
  contact: {
    primaryContactId: insertId,
    emails: [email].filter(Boolean),
    phoneNumbers: [phoneNumber].filter(Boolean),
    secondaryContactIds: [],
  },
};

return responsePayload;

}


const createSecondaryContact = async(primaryContact, email, phoneNumber) => {

  const [insertResult] = await knexInstance.raw(
    'INSERT INTO contacts (phoneNumber, email, linkedId, linkPrecedence) VALUES (?, ?, ?, "secondary")',
    [phoneNumber, email, primaryContact.id]
  );

  console.log("++++++++++inside secondary contact creation");
  console.log(insertResult)

  // Retrieve all primary and secondary contacts for the user
  const [allContacts] = await knexInstance.raw(
    'SELECT * FROM contacts WHERE id = ? OR linkedId = ?',
    [primaryContact.id, primaryContact.id]
  );
  
  let responsePayload;
  if(email == primaryContact.email){
     responsePayload = {
      contact: {
        primaryContactId: primaryContact.id,
        emails: [...new Set([primaryContact?.email].filter(Boolean))],
        phoneNumbers: allContacts.map((contact) => contact.phoneNumber).filter(Boolean),
        secondaryContactIds: allContacts
          .filter((contact) => contact.linkPrecedence === 'secondary')
          .map((contact) => contact.id),
      },
    };
  }else{
     responsePayload = {
      contact: {
        primaryContactId: primaryContact.id,
        emails: allContacts.map((contact) => contact.email).filter(Boolean),
        phoneNumbers:[...new Set([primaryContact?.phoneNumber].filter(Boolean))],
        secondaryContactIds: allContacts
          .filter((contact) => contact.linkPrecedence === 'secondary')
          .map((contact) => contact.id),
      },
    };
  }
 
  return responsePayload;

}


const makeContactSecondary = async (primaryContact, secondaryContact) => {
  // Update the linkPrecedence for secondary contact and set linkedId to the primaryContact.id
  await knexInstance.raw(
    'UPDATE contacts SET linkPrecedence = "secondary", linkedId = ? WHERE id = ?',
    [primaryContact.id, secondaryContact.id]
  );

  return {
    contact: {
      primaryContactId: primaryContact.id,
      emails: [primaryContact.email, secondaryContact.email].filter(Boolean),
      phoneNumbers: [primaryContact.phoneNumber, secondaryContact.phoneNumber].filter(Boolean),
      secondaryContactIds: [secondaryContact.id],
    },
  };
};

const getUserContacts = async(email, phoneNumber) => {

 let query = `SELECT c1.* FROM contacts c1
  LEFT JOIN contacts c2 ON c1.id = c2.linkedId OR c1.linkedId = c2.id  
  WHERE c1.email = ? OR c1.phoneNumber = ? OR c2.email = ? OR c2.phoneNumber = ?`;

 let bindings = [email, phoneNumber, email, phoneNumber];
 let [results] = await knexInstance.raw(query, bindings);

  let primaryContact = results.find((contact) => contact.linkPrecedence === 'primary');
  let secondaryContacts = results.filter(
   (contact) => contact.linkPrecedence === 'secondary'
 );

 let responsePayload;

 if(email == primaryContact.email){
  responsePayload = {
   contact: {
     primaryContactId: primaryContact.id,
     emails: [...new Set([primaryContact?.email].filter(Boolean))],
     phoneNumbers: results.map((contact) => contact.phoneNumber).filter(Boolean),
     secondaryContactIds: secondaryContacts
       .map((contact) => contact.id),
   },
 };
}else if(phoneNumber == primaryContact.phoneNumber){
  responsePayload = {
   contact: {
     primaryContactId: primaryContact.id,
     emails: results.map((contact) => contact.email).filter(Boolean),
     phoneNumbers:[...new Set([primaryContact?.phoneNumber].filter(Boolean))],
     secondaryContactIds: secondaryContacts
       .map((contact) => contact.id),
   },
 };
}else{
  responsePayload = {
    contact: {
      primaryContactId: primaryContact ? primaryContact.id : null,
      emails: [primaryContact?.email, ...secondaryContacts.map((contact) => contact.email)].filter(Boolean),
      phoneNumbers: [...new Set([primaryContact?.phoneNumber, ...secondaryContacts.map((contact) => contact.phoneNumber)].filter(Boolean))],
      secondaryContactIds: secondaryContacts.map((contact) => contact.id),
    },
  };
}

   return responsePayload;
}



// Use routes
app.use('/identify', identifyContact);

// Start the server after running migrations
runMigrations().then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
});


