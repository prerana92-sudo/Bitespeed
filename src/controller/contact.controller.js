
const mysql = require('mysql2');

// MySQL Connection Pool
const connection = mysql.createConnection({
  host: process.env.MYSQL_HOST ||'127.0.0.1',
  user: process.env.MYSQL_USER ||'root',
  password: process.env.MYSQL_PASSWORD ||'',
  database: process.env.MYSQL_DATABASE ||'Bitespeed_Contacts',
});

// Connect to the database
connection.connect((err) => {
  if (err) {
    console.error('Error connecting to the database:', err.message);
    return;
  }
  console.log('Connected to the MySQL database.');
});

// Handle connection error event
connection.on('error', (err) => {
  console.error('Database connection error:', err.message);
});

// Handle connection close event
connection.on('end', () => {
  console.log('MySQL connection closed.');
});



const identifyContact = async (req, res) => {
  
    const { email, phoneNumber } = req.body;
  
    if (!email && !phoneNumber) {
      return res.status(400).json({ error: 'Invalid input. Both email and phoneNumber cannot be null.' });
    }
    let query;
    if((email && phoneNumber == null) || (phoneNumber && email == null)){
     query = `SELECT c1.* FROM contacts c1
    LEFT JOIN contacts c2 ON c1.id = c2.linkedId OR c1.linkedId = c2.id  WHERE c1.email = ? OR c1.phoneNumber = ? OR c2.email = ? OR c2.phoneNumber = ?
    `;
    } else{
        query = `SELECT c1.* FROM contacts c1
        LEFT JOIN contacts c2 ON c1.id = c2.linkedId OR c1.linkedId = c2.id`;
    }

    
  
    try {
      const [results] = await connection.promise().query(query, [email, phoneNumber, email, phoneNumber]);

      //incase when one parameter is null and email or phone doesnot exist.
      if(results.length == 0){
        return res.status(400).json({ error: 'Invalid data. User not found!' });
      }

      let filteredResult;

     //create primary contact if no data exists
    if(email != null && phoneNumber != null){

       // Filter the results to check if data exists for the given email and phone number
          filteredResult = results.filter(
           (contact) => contact.email === email || contact.phoneNumber === phoneNumber
         );

          if(filteredResult.length === 0){
            // If no contacts are found, create a new primary contact
             const { insertId } = await connection.promise().execute(
                'INSERT INTO contacts (phoneNumber, email, linkPrecedence) VALUES (?, ?, "primary")',
                [phoneNumber, email]
              );
      
            // Prepare the response payload for the new primary contact
            const responsePayload = {
              contact: {
                primaryContactId: insertId,
                emails: [email].filter(Boolean),
                phoneNumbers: [phoneNumber].filter(Boolean),
                secondaryContactIds: [],
              },
            };
      
            return res.status(200).json(responsePayload);
            }  
          
        }else{
            filteredResult = results;
        }
      
  
      // Identify the primary contact and secondary contacts
      let primaryContact = filteredResult.find((contact) => contact.linkPrecedence === 'primary');
      let secondaryContacts = filteredResult.filter(
        (contact) => contact.linkPrecedence === 'secondary'
      );
  

    
    // Check if the email and phone exist in different contacts
    const emailExistsInDifferentContact = filteredResult.some(
        (contact) => contact.email === email && contact.id !== primaryContact?.id
      );
  
      const phoneExistsInDifferentContact = filteredResult.some(
        (contact) => contact.phoneNumber === phoneNumber && contact.id !== primaryContact?.id
      );
  
      if (emailExistsInDifferentContact || phoneExistsInDifferentContact) {
        // If either email or phone number exists in a different contact,
        // the older contact should be marked as the primary contact

        //swap only if both data are primary in nature.
        const isPrimaryInResults = filteredResult.some(
          (contact) => contact.linkedId === primaryContact?.id
        );

        if (!isPrimaryInResults) {

        const sortedContacts = filteredResult.sort(
          (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
        );
  
        primaryContact = sortedContacts[0];
        secondaryContacts.push(...sortedContacts.slice(1));
  
        // Update the linkPrecedence for secondary contacts
        await Promise.all(
          secondaryContacts.map((contact) =>
            connection.promise().execute(
              'UPDATE contacts SET linkPrecedence = "secondary", linkedId = ? WHERE id = ?',
              [primaryContact.id, contact.id]
            )
          )
        );
    }

     // Prepare the response payload
      const responsePayload = {
        contact: {
          primaryContactId: primaryContact ? primaryContact.id : null,
          emails: [primaryContact?.email, ...secondaryContacts.map((contact) => contact.email)].filter(Boolean),
          phoneNumbers: [primaryContact?.phoneNumber, ...secondaryContacts.map((contact) => contact.phoneNumber)].filter(Boolean),
          secondaryContactIds: secondaryContacts.map((contact) => contact.id),
        },
      };
  
      return res.status(200).json(responsePayload);
    
      }
  
    
      // Check if the email or phone already exists in the results
     
      const existingContact = filteredResult.find(
        (contact) => ( contact.email === email && contact.phoneNumber === phoneNumber)
      );
  
      if (existingContact) {
        // If data for email and phone already exists, return the data in the response
        const responsePayload = {
          contact: {
            primaryContactId: primaryContact ? primaryContact.id : null,
            emails: [primaryContact?.email, ...secondaryContacts.map((contact) => contact.email)].filter(Boolean),
            phoneNumbers: [primaryContact?.phoneNumber].filter(Boolean),
            secondaryContactIds: secondaryContacts.map((contact) => contact.id),
          },
        };
  
        return res.status(200).json(responsePayload);
      }
  
      // If existing primary contact is found and new request has different email or phoneNumber, create a secondary contact
      if (
        primaryContact &&
        ((email && phoneNumber!= null && primaryContact.email !== email) ||
          (phoneNumber && email != null && primaryContact.phoneNumber !== phoneNumber)) 
      ) {
        
        const [insertResult] = await connection.promise().execute(
            'INSERT INTO contacts (phoneNumber, email, linkedId, linkPrecedence) VALUES (?, ?, ?, "secondary")',
            [phoneNumber, email, primaryContact.id]
          );
          const secondaryContactId = insertResult.insertId;
      
          // Retrieve all primary and secondary contacts for the user
          const [allContacts] = await connection.promise().query(
            'SELECT * FROM contacts WHERE id = ? OR linkedId = ?',
            [primaryContact.id, primaryContact.id]
          );
      
          // Prepare the response payload for all contacts
          const responsePayload = {
            contact: {
              primaryContactId: primaryContact.id,
              emails: allContacts.map((contact) => contact.email).filter(Boolean),
              phoneNumbers: allContacts.map((contact) => contact.phoneNumber).filter(Boolean),
              secondaryContactIds: allContacts
                .filter((contact) => contact.linkPrecedence === 'secondary')
                .map((contact) => contact.id),
            },
          };
      
          return res.status(200).json(responsePayload);
        }
  
      // If no secondary contact creation is necessary, return the primary contact and secondary contacts
      const responsePayload = {
        contact: {
          primaryContactId: primaryContact ? primaryContact.id : null,
          emails: [primaryContact?.email, ...secondaryContacts.map((contact) => contact.email)].filter(Boolean),
          phoneNumbers: [primaryContact?.phoneNumber].filter(Boolean),
          secondaryContactIds: secondaryContacts.map((contact) => contact.id),
        },
      };
  
      return res.status(200).json(responsePayload);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  
  };
  

  module.exports = {
    identifyContact
  };